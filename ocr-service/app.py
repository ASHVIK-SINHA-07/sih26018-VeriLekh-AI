"""
Self-hosted OCR service for the land record digitization system.

Implements the one interface the application knows about, from
docs/02_Technical_Architecture.md:

    POST /extract  { "imagePath": "uploads/seed/khatauni-lucknow-0388.svg" }
      -> { "rawText": str, "language": str,
           "blocks": [ { "text": str, "confidence": float }, ... ] }

Nothing here touches the network. Language models are installed into the
image and documents are read from a read-only mount of the application's own
upload directory, so land ownership data never leaves this machine.
"""
from __future__ import annotations

import io
import logging
import os
import re
import unicodedata
from pathlib import Path

import cairosvg
import numpy as np
import pytesseract
from fastapi import FastAPI, HTTPException
from pdf2image import convert_from_path
from PIL import Image, ImageFilter, ImageOps
from pydantic import BaseModel
from pytesseract import Output

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("ocr")

UPLOAD_ROOT = Path(os.environ.get("UPLOAD_ROOT", "/data")).resolve()

# Land records mix scripts: Devanagari prose with Latin digits for survey,
# khasra and khata numbers. Reading them in one pass performs badly, so each
# script is read separately and the results merged by position on the page.
DEVANAGARI_LANG = "hin"
NUMERIC_LANG = "eng"
NUMERIC_WHITELIST = "0123456789/.-"

# Two page-segmentation modes, merged.
#
# 11 (sparse) finds text the layout analyser misses, but scatters a wide
# label/value row into separate lines. 6 (uniform block) keeps a row together
# but drops isolated values. Running both and de-duplicating recovers more of
# the page than either alone.
PSM_MODES = ("--psm 11", "--psm 6")

MIN_RENDER_WIDTH = 3000
PDF_DPI = 300
MIN_WORD_CONFIDENCE = 30.0

app = FastAPI(title="Land record OCR", version="1.0")


class ExtractRequest(BaseModel):
    imagePath: str


def resolve(image_path: str) -> Path:
    """
    Map an application-relative path onto the mounted volume, refusing
    anything that escapes it. The path comes from our own database, but a
    traversal bug upstream must not become arbitrary file read here.
    """
    candidate = (UPLOAD_ROOT / image_path.lstrip("/")).resolve()
    if candidate != UPLOAD_ROOT and UPLOAD_ROOT not in candidate.parents:
        raise HTTPException(status_code=400, detail="Path outside the upload root")
    if not candidate.is_file():
        raise HTTPException(status_code=404, detail=f"No file at {image_path}")
    return candidate


def rasterise(path: Path) -> Image.Image:
    """Turn whatever the record is stored as into a single page image."""
    suffix = path.suffix.lower()

    if suffix == ".svg":
        png = cairosvg.svg2png(url=str(path), output_width=MIN_RENDER_WIDTH)
        image = Image.open(io.BytesIO(png))
    elif suffix == ".pdf":
        # Legacy PDFs are the case the problem statement names directly. Only
        # the first page is read; in this system one page is one document.
        pages = convert_from_path(str(path), dpi=PDF_DPI, first_page=1, last_page=1)
        if not pages:
            raise HTTPException(status_code=422, detail="PDF has no readable pages")
        image = pages[0]
    else:
        image = Image.open(path)

    if image.mode != "RGB":
        image = image.convert("RGB")

    if image.width < MIN_RENDER_WIDTH:
        ratio = MIN_RENDER_WIDTH / image.width
        image = image.resize(
            (MIN_RENDER_WIDTH, int(image.height * ratio)), Image.LANCZOS
        )
    return image


def preprocess(image: Image.Image) -> Image.Image:
    """
    Normalise a page before recognition.

    Aged registers photograph as low contrast — faded ink on discoloured
    paper, often with no true black or white in the frame. One of our own
    sample pages spans only grey 56-191, and the recogniser reads far less
    from it untouched. Stretching the tonal range and sharpening the strokes
    is what makes Devanagari legible.

    Deliberately not binarised: a hard threshold eats the light matras that
    distinguish similar characters, which is exactly the detail a land record
    needs read correctly.
    """
    gray = ImageOps.grayscale(image)
    gray = ImageOps.autocontrast(gray, cutoff=2)
    return gray.filter(ImageFilter.UnsharpMask(radius=2, percent=140, threshold=3))


def read_words(page: Image.Image, lang: str, config: str) -> list[dict]:
    """One recognition pass, returned as positioned words."""
    data = pytesseract.image_to_data(
        page, lang=lang, config=config, output_type=Output.DICT
    )
    words = []
    for i in range(len(data["text"])):
        text = data["text"][i].strip()
        confidence = float(data["conf"][i])
        if not text or confidence < MIN_WORD_CONFIDENCE:
            continue
        words.append(
            {
                "text": text,
                "confidence": confidence,
                "y": data["top"][i] + data["height"][i] / 2,
                "x": data["left"][i],
                "height": data["height"][i],
            }
        )
    return words


def drop_duplicates(words: list[dict]) -> list[dict]:
    """
    Four passes see the same page, so the same word is found repeatedly.
    Two readings of the same text within half a line-height of each other are
    the same word; keep whichever the engine was more confident about.
    """
    kept: list[dict] = []
    for word in sorted(words, key=lambda w: -w["confidence"]):
        if any(
            other["text"] == word["text"]
            and abs(other["y"] - word["y"]) < 20
            and abs(other["x"] - word["x"]) < 40
            for other in kept
        ):
            continue
        kept.append(word)
    return kept


def merge_into_lines(words: list[dict]) -> list[dict]:
    """
    Group words into the rows of the register.

    The two script passes each see the whole page, so a row arrives as
    separate pieces — the printed Devanagari label from one pass, the Latin
    number from the other. Grouping by vertical position and ordering left to
    right rebuilds the line the field extractor expects ("खाता संख्या 214").

    A line's confidence is the *lowest* of its words, not the mean: printed
    labels always read cleanly, so averaging would mask exactly the
    uncertainty about the written value that a reviewer needs to see.
    """
    if not words:
        return []

    words.sort(key=lambda w: w["y"])
    typical = float(np.median([w["height"] for w in words])) or 20.0
    tolerance = max(typical * 0.6, 12.0)

    lines: list[list[dict]] = [[words[0]]]
    for word in words[1:]:
        if abs(word["y"] - lines[-1][-1]["y"]) <= tolerance:
            lines[-1].append(word)
        else:
            lines.append([word])

    blocks = []
    for line in lines:
        line.sort(key=lambda w: w["x"])

        # Both passes can read the same numeral; drop an immediate repeat.
        parts: list[str] = []
        for word in line:
            if not parts or parts[-1] != word["text"]:
                parts.append(word["text"])

        text = re.sub(r"\s+", " ", " ".join(parts)).strip()
        if not text:
            continue
        blocks.append(
            {
                "text": text,
                "confidence": round(min(w["confidence"] for w in line) / 100.0, 4),
            }
        )
    return blocks


@app.get("/health")
def health() -> dict:
    try:
        version = str(pytesseract.get_tesseract_version())
        languages = pytesseract.get_languages(config="")
    except Exception as error:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"Engine unavailable: {error}")
    return {
        "status": "ok",
        "engine": f"tesseract {version}",
        "languages": [lang for lang in languages if lang != "osd"],
    }


@app.post("/extract")
def extract(request: ExtractRequest) -> dict:
    path = resolve(request.imagePath)
    log.info("reading %s", path)

    try:
        page = preprocess(rasterise(path))
    except HTTPException:
        raise
    except Exception as error:  # noqa: BLE001 — surface the real cause
        log.exception("could not rasterise %s", path)
        raise HTTPException(
            status_code=422, detail=f"Unreadable file: {error}"
        ) from error

    words: list[dict] = []
    for psm in PSM_MODES:
        words += read_words(page, DEVANAGARI_LANG, psm)
        words += read_words(
            page, NUMERIC_LANG, f"{psm} -c tessedit_char_whitelist={NUMERIC_WHITELIST}"
        )

    words = drop_duplicates(words)
    blocks = merge_into_lines(words)
    log.info("%s -> %d lines from %d words", path.name, len(blocks), len(words))

    return {
        "rawText": "\n".join(block["text"] for block in blocks),
        "language": "hi",
        "blocks": blocks,
    }
