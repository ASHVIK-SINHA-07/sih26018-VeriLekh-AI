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
| OCR | Stubbed HTTP interface | Engine deliberately undecided — see below |

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

### OCR is a seam, not an engine

All OCR access goes through a single function in `src/lib/ocr.ts`, which calls an
external service over HTTP. The repository ships a **mock** that returns
realistic canned Devanagari text, so the whole application runs end to end
without a real engine attached.

When the team settles on an engine, they stand up a service exposing
`POST /extract` that returns `{ rawText, language, blocks[] }` and point
`OCR_SERVICE_URL` at it. Nothing else in the codebase changes. This is
deliberate: the engine choice should not be baked into the application.

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
docker compose up -d          # local Postgres on :5432
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
| `OCR_SERVICE_URL` | `mock` until a real engine is wired in |
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
