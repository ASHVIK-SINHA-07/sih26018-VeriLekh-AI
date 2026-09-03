# SIH26018 — Land record digitization & validation system

AI-assisted **back-office** pipeline for government revenue staff to digitize and
validate India's legacy paper land records.

> This is **not** a citizen-facing portal. Bhulekh and NGDRS already let citizens
> search *already-digitized* records. This system is the ingestion pipeline that
> converts the undigitized paper backlog into clean, validated records — the
> missing step before a record can appear on those portals.

Built for Smart India Hackathon problem statement SIH26018.

## Stack

Next.js 15 (App Router) · TypeScript (strict) · PostgreSQL via Docker · Prisma ·
Tailwind CSS v4 + shadcn/ui · Auth.js (NextAuth v5) · OCR behind a swappable
HTTP interface.

## Prerequisites

- Node.js **22.6+** (the seed script runs TypeScript natively — see D12 in `CLAUDE.md`)
- npm
- Docker Desktop (for local Postgres)

## First run

```bash
npm install
cp .env.example .env          # then fill in the values below
docker compose up -d          # local Postgres on :5432
npx prisma migrate dev --name init
npx prisma db seed
npm run dev                   # http://localhost:3000
```

Generate the auth secret with:

```bash
openssl rand -base64 32
```

Log in with a seeded account — `npx prisma db seed` prints the credentials:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@revenue.gov.in` | `Admin@12345` |
| Verifier | `verifier@revenue.gov.in` | `Verify@12345` |
| Viewer | `viewer@revenue.gov.in` | `Viewer@12345` |

Synthetic local-development accounts. Admin and Verifier land on `/upload`,
Viewer on `/dashboard`.

## Environment variables

| Key | Purpose |
|---|---|
| `DATABASE_URL` | Local Postgres connection string (from `docker-compose.yml`) |
| `AUTH_SECRET` | Auth.js session secret — generate per environment, never commit |
| `OCR_SERVICE_URL` | `mock` until the team wires a real engine |
| `UPLOAD_DIR` | Local directory for uploaded scans (`./uploads`) |

`.env` is gitignored. `.env.example` documents the keys with placeholders only.

## Data sovereignty

Postgres runs in local Docker and uploaded scans stay in `./uploads` — land
ownership data never leaves the machine. OCR is designed to run against a
self-hostable engine, so document images need never reach a third-party cloud AI.

All seed and demo data is **synthetic**: realistic in format, fake in content.
Never load real citizens' ownership records.

## Build order

The build follows a fixed ticket order, `T0`–`T10`: scaffold, database, auth,
seed data, extraction pipeline, document APIs, upload screen, verification
screen, dashboard, integration mock, polish.
