# SIH26018 — Land record digitization & validation system

An AI-assisted **back-office pipeline** that turns India's legacy paper land
records into clean, structured, validated digital records — with a human in the
loop and a full audit trail.

> **This is not a citizen-facing portal.** Bhulekh and NGDRS already let citizens
> search records that have *already* been digitized. What they don't solve is the
> undigitized backlog still sitting in paper form in tehsil and village offices.
> This system is the missing step *before* a record can appear on those portals.
> It feeds into NGDRS/DILRMP; it does not compete with them.

Built for Smart India Hackathon problem statement SIH26018.

---

## The problem

Across India a large share of land records still exist only as handwritten
registers, faded scans, cadastral maps and legacy PDFs. They are the legal basis
for ownership, taxation, acquisition and dispute resolution — yet converting them
to digital records is still done by hand: slow, costly and error-prone. Poor scan
quality, regional scripts and handwritten annotations make it worse.

## What the system does

```
Upload scan → OCR extracts text → fields are mapped to a structured record
   → each field gets a confidence score → validation flags problems
   → a human verifies the low-confidence fields → record is committed
   → ULPIN-style ID generated, action written to the audit trail
```

A record is only ever committed by a person. The AI narrows what that person has
to look at — it does not decide ownership.

**Capabilities** — what the system does by design. See
[build status](#build-status) below for what is implemented today.

- Document upload, single and batch, images and PDFs
- OCR text extraction through a swappable interface
- Extraction into nine structured fields: owner name, survey number, khasra
  number, khata number, plot area, village, tehsil, district, land classification
- Per-field confidence scoring, with low-confidence fields flagged for review
- A validation engine: missing-field checks, range checks, and duplicate or
  conflicting parcel detection
- ULPIN-style unique ID generated for each validated record
- Side-by-side human verification — scan on the left, editable fields on the right
- An append-only audit trail: every upload, edit, approval and rejection is
  recorded with actor and timestamp
- A dashboard of throughput, extraction accuracy, pending and flagged counts
- A simulated NGDRS/DILRMP integration endpoint, clearly labelled as such

## Who uses it

Internal government revenue staff — not the public.

| Role | Who | Can do |
|---|---|---|
| **Verifier** | Patwari / Lekhpal / data-entry clerk | Upload, run extraction, review, approve or reject |
| **Admin** | Supervising revenue officer | Everything a verifier does, plus dashboard and user management |
| **Viewer** | Auditor / senior official | Read-only dashboard — no upload, no edit |

---

## Architecture

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15, App Router | UI and API routes in one project — no separate server, no CORS, one deploy |
| Language | TypeScript, strict | Contract mismatches fail at compile time |
| Database | PostgreSQL 16, self-hosted in Docker | Land records are relational; running locally keeps data on your own infrastructure |
| ORM | Prisma | One schema file is the single source of truth for the data model |
| UI | Tailwind CSS v4 + shadcn/ui | Accessible prebuilt primitives instead of hand-rolled components |
| Auth | Auth.js (NextAuth v5), credentials provider | Email/password with a `role` claim on the session |
| OCR | Tesseract 5 (Hindi + English), self-hosted in Docker | Runs on your own hardware — see below |

### Data model

Five tables, all linked by foreign keys:

- **User** — email, bcrypt password hash, role
- **Document** — the uploaded file and its status (`UPLOADED` → `PROCESSING` →
  `FLAGGED`/`VERIFIED`/`REJECTED`)
- **ExtractedRecord** — the nine structured fields, the ULPIN, and a JSON
  confidence map of `{ field: 0.0–1.0 }`
- **ValidationResult** — pass/flagged/duplicate, the list of issues, and a
  pointer to the record it duplicates
- **AuditLog** — actor, action, before/after snapshots, timestamp

### OCR: real, and running on your own hardware

Text recognition runs in `ocr-service/` — a small FastAPI service using
**Tesseract 5** with the Hindi (Devanagari) and English language models,
started alongside the database by `docker compose up -d`.

It never touches the network. The language models are installed into the image
at build time and documents are read from a read-only mount of the application's
own upload directory, so **no document image is ever sent to a third-party API**
and the service works on a disconnected machine. That is what makes the
data-sovereignty position real rather than aspirational.

How a page is read:

1. The record is rasterised — SVG via cairo, legacy PDF via poppler at 300 dpi.
2. Contrast is stretched and strokes sharpened. Aged registers photograph with
   no true black or white; one sample page spans only grey 56–191 untouched.
3. Two recognition passes run over the page — Devanagari, and a digit-restricted
   Latin pass for survey, khasra and khata numbers — each at two page
   segmentation modes.
4. Words are merged into lines by position, so a label and its value rejoin.
   A line's confidence is the **lowest** of its words: printed labels always
   read cleanly, and averaging would hide uncertainty about the written value.

Measured on three sample records: **20 of 27 fields exactly correct, 25 of 27
populated.** The residual errors are Devanagari matra reordering by the engine
(`मलिहाबाद` read as `मलहिबाद`). Every incorrect field so far has scored below
the confidence threshold, so it is flagged and reaches a human — which is what
the verification workflow exists for.

The application only ever calls `runOcr()` in `src/lib/ocr.ts`, so a department
can substitute its own engine by exposing `POST /extract` returning
`{ rawText, language, blocks[] }` and pointing `OCR_SERVICE_URL` at it. Setting
`OCR_SERVICE_URL=mock` falls back to canned data for development without the
container running.

### Security and access

Two layers of enforcement, both required:

1. **Route protection.** Middleware redirects unauthenticated requests to the
   login page and keeps Viewers out of the upload and verification screens.
2. **Server-side authorization.** Every mutating API route re-checks the session
   role before acting. The client is never trusted — a Viewer calling the verify
   endpoint directly gets a `403`, even though the button is hidden in their UI.

Passwords are stored as bcrypt hashes, never plaintext. Sessions live in an
httpOnly cookie. Audit rows are append-only in practice — no delete or edit path
is exposed for them.

### Data sovereignty

Postgres runs in local Docker and uploaded scans stay in `./uploads`, so land
ownership data never leaves the machine it is running on. Because OCR is designed
to run against a self-hostable engine, document images need never be sent to a
third-party cloud AI.

> Land ownership data never leaves government-controlled infrastructure — no
> third-party API, no external data transmission.

**All seed and demo data is synthetic**: realistic in format, entirely fabricated
in content. Owner names, survey numbers and parcels are invented. Real citizens'
ownership records must never be loaded into this system.

---

## Getting started

**Prerequisites** — Node.js 22.6 or later (the seed script runs TypeScript
natively), npm, and Docker Desktop.

```bash
npm install
cp .env.example .env          # then fill in the values below
docker compose up -d          # Postgres on :5432, OCR service on :8001
                              # first run builds the OCR image (~3 min)
npx prisma migrate dev --name init
npx prisma db seed
npm run dev                   # http://localhost:3000
```

Generate the auth secret with `openssl rand -base64 32`.

### Seeded accounts

`npx prisma db seed` loads three role accounts and 18 synthetic documents —
including four deliberately planted problems (a duplicate parcel, a mismatched
owner, a missing field, and a faded scan with low-confidence fields) so the
validation engine has something real to catch.

| Role | Email | Password |
|---|---|---|
| Admin | `admin@revenue.gov.in` | `Admin@12345` |
| Verifier | `verifier@revenue.gov.in` | `Verify@12345` |
| Viewer | `viewer@revenue.gov.in` | `Viewer@12345` |

Local development accounts only. Admin and Verifier land on `/upload`, Viewer on
`/dashboard`. The seed is idempotent — re-run it to return the database to a
known clean state with the planted errors intact.

### Environment variables

| Key | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (matches `docker-compose.yml`) |
| `AUTH_SECRET` | Auth.js session secret — generate per environment, never commit |
| `OCR_SERVICE_URL` | `http://localhost:8001` (the bundled OCR service), or `mock` for offline development |
| `UPLOAD_DIR` | Local directory for uploaded scans (`./uploads`) |

`.env` is gitignored; `.env.example` documents every key with placeholder values.

---

## Repository layout

```
├── prisma/
│   ├── schema.prisma       data model — the single source of truth
│   ├── seed.ts             synthetic seed data
│   └── migrations/
├── src/
│   ├── app/                pages and API routes (App Router)
│   ├── components/         shared UI components
│   ├── lib/                db client, auth, OCR interface, extraction,
│   │                       validation, ULPIN generator
│   ├── types/              shared types matching the API contract
│   └── middleware.ts       route protection
├── docker-compose.yml      local Postgres
└── uploads/                uploaded scans (gitignored)
```

### A note on `docs/`

The working tree also contains a `docs/` directory that is **intentionally not
committed**. It holds the internal build specification — the product
requirements, technical architecture, security model, frontend screen specs, a
ticket-by-ticket build plan and a pre-demo checklist. Those documents drive
development but are planning material rather than part of the deliverable, so
they are kept local. Everything needed to understand, run and extend this
codebase is in this README, in `prisma/schema.prisma`, and in the type
definitions under `src/types/`.

---

## Build status

The system is built ticket by ticket in a fixed order.

| | Ticket | Status |
|---|---|---|
| T0 | Project scaffold | ✅ |
| T1 | Local database and Prisma schema | ✅ |
| T2 | Auth, roles and route protection | ✅ |
| T3 | Synthetic seed data with planted errors | ✅ |
| T4 | OCR interface, extraction, validation, ULPIN | ✅ |
| T5 | Document APIs | ✅ |
| T6 | Upload screen | ✅ |
| T7 | Verification screen | ✅ |
| T8 | Dashboard | ✅ |
| T9 | Simulated integration endpoint | ✅ |
| T10 | Polish and audit view | ✅ |

## Roadmap

Deliberately out of scope for this build, and designed for rather than
implemented:

- Live integration with production LRMS / DILRMP / NGDRS / GIS systems
  (currently simulated behind a clearly labelled mock endpoint)
- A self-improving model — corrections are logged as future retraining data
  rather than fed back automatically
- Full multilingual OCR across all 22 scheduled languages; the architecture is
  extensible, and one script is supported deeply
- SSO and government identity federation, rate limiting, field-level encryption
  at rest, and multi-tenant isolation across states
