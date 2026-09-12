# Dataset card

What VeriLekh-AI is measured on, what it learns from, and what it does not.

## No model is trained

This matters, so it comes first. **VeriLekh-AI does not train, fine-tune or
retrain any machine-learning model.** Every component is one of these:

| Component | What it is | Learned parameters |
|---|---|---|
| Text recognition | Tesseract 5.5.0 with the Tesseract project's fast integer LSTM models — [`tessdata_fast`](https://github.com/tesseract-ocr/tessdata_fast), Apache 2.0 — installed from Debian's `tesseract-lang` 4.1.0 packages at image build time: `hin`, `mar`, `ben`, `tam`, `tel`, `guj`, `pan`, `kan`, `ori`, `eng` | Pretrained by the Tesseract project. Used as shipped — not retrained on our data. |
| Field extraction | Rule-based: field labels matched on their Devanagari consonant skeleton | None |
| Document classification | Rule-based: the page's heading, matched on consonant skeleton | None |
| Validation, quality score, cross-source reconciliation, chain of title | Rules and exact arithmetic | None |
| Correction memory | An exact-match substitution table (`LearnedCorrection`), filled at runtime by corrections officers approve. A misreading is replaced only by a value a person already chose, only in the same field. | None — it is a lookup table, not a model. No weights, no gradient, no generalisation beyond the exact string corrected. |

So when this project says the system *learns from corrections*, it means that
table — measured, and described precisely as correction memory.

## Evaluation corpus

Everything below is **synthetic**. No real citizen's land record is used
anywhere in this project: every name, survey number and parcel is invented.

| Set | Size | Where it lives | Used for |
|---|---|---|---|
| Khatauni (Record of Rights) scans | 17 documents, 152 ground-truth fields | Ground truth: `prisma/seed-data.ts`. Scans rendered by `prisma/seed-scan.ts` | Extraction accuracy; correction-memory held-out test |
| Mutation orders (दाखिल-खारिज) | 3 documents, 30 ground-truth fields | `prisma/seed-mutation-orders.ts` | Classification; order extraction |
| Marathi 7/12 extract | 1 document, 9 fields | `prisma/seed-multilingual.ts` | Multilingual demonstration |
| Simulated authoritative sources | 7 records across RoR, Registration, Cadastral | `prisma/seed-authoritative.ts` | Cross-source reconciliation |
| Ownership chains | 5 parcels, 20 mutation entries, 2005–2025 | `prisma/seed-chains.ts` | Chain-of-title validation |
| Village cadastral maps | 8 villages, 36 plots, invented boundaries | `src/lib/village-maps.ts` | Record-against-map checks: area, overlap, khasra missing from the map |

**How the scans are made.** Each scan is rendered as an image of a printed
government form on aged paper, in five Uttar Pradesh districts (Varanasi,
Lucknow, Gorakhpur, Prayagraj, Kanpur Nagar). Fields the seed marks as low
confidence are drawn faded and smudged, so degradation is present — but it is
simulated. Every scan then goes through the **real OCR service**; nothing
in the benchmark reads the ground truth back as if the engine had read it.

**Planted defects.** Some documents deliberately carry problems — a duplicate
parcel, an owner conflict, a missing field, a faded page, an area mismatch
against the survey, a double sale, a sale by a deceased holder. They exist so
the validation rules have something real to catch, and are listed by the
seed command when it runs.

## Splits

The correction-memory result is **held out, split by document**: the first 8
khatauni documents in `seed-data.ts` order are the training half, the last 9
the test half. No page appears in both — splitting by field would put two
lines from the same page on either side and leak the answer. The split is
deterministic, so the same corpus at the same commit gives the same number.

## Results

Every figure is produced by one script, and quoted from nowhere else:

```bash
npm run benchmark            # print the report
npm run benchmark -- --json  # also write benchmark-results.json
```

| Measure | Result |
|---|---|
| Khatauni fields populated | 143 / 152 — 94% |
| Khatauni fields exactly correct | 103 / 152 — 68% |
| Wrong fields flagged for a person | 42 / 49 — 86% |
| Correction memory, held out | 64% → 73% on 9 unseen documents, no regressions |
| Document classification | 17 / 17 khatauni, 3 / 3 mutation orders |
| Mutation-order fields, exact as printed | 19 / 30 — 63% |
| Mutation-order fields, usable | 29 / 30 — 97% (same person, date, share or transfer type once matra reordering is set aside) |
| Marathi 7/12, auto-detected language | 6 / 9 exact |
| Marathi 7/12, `language: mar` | 7 / 9 exact |

## Limitations — read before quoting any number

- **Small.** 17 khatauni documents, 3 mutation orders, 1 Marathi page. The
  mutation-order and Marathi figures demonstrate that the path works; they are
  not statistically meaningful accuracy estimates.
- **Printed and rendered, not photographed.** The scans are rendered from
  fonts. Real registers are photographed or scanned, often handwritten, often
  damaged, and accuracy on them will be lower than measured here.
- **No handwriting.** Handwritten text is outside what the current engine
  reads; it is routed to a person rather than transcribed.
- **Simulated sources.** The authoritative RoR, Registration and Cadastral
  records are synthetic stand-ins with the shape a real integration would
  return. No government system is contacted.
- **Fast models, not best.** The installed recognition models are
  `tessdata_fast`. The larger `tessdata_best` models are more accurate and
  slower; swapping them in is a build-time change, and would be measured with
  the same benchmark before any new figure is quoted.
- **Invented geometry.** The village maps' plot boundaries are made up. They show how a record is checked against cadastral data; they are not real parcels, and no GIS or Bhu-Naksha data is used.
- **One state's forms.** Labels are those of Uttar Pradesh khatauni and
  mutation orders, plus Marathi 7/12 labels. Other states' forms need their
  own label sets.

## If a model is trained later

A fine-tuned recognition model is the natural next step, and the data for it
is already being collected: every correction an officer approves is stored
with the scan it came from and its before-and-after value — labelled line data
from real use. Any such model will be documented here with its training data,
its split and its measured result before it is used or quoted.
