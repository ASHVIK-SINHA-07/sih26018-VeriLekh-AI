# Self-hosted OCR for the land record digitization system.
#
# Everything runs in this container on the department's own hardware: no
# document image is ever sent to a third-party API, and the language models
# are installed at build time, so the service works with no network at all.
#
# Engine: Tesseract 5 with the Hindi (Devanagari) and English models.
# EasyOCR was evaluated first and rejected on measurement — its Devanagari
# recogniser returned "तK" at 0.000 confidence even for clean, large,
# black-on-white text, while Tesseract read the same line exactly.
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        tesseract-ocr-hin \
        tesseract-ocr-eng \
        libcairo2 \
        poppler-utils \
        fontconfig \
        fonts-noto-core \
        fonts-deva \
        fonts-dejavu-core \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
