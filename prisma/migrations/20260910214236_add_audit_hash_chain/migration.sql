-- Tamper-evident provenance for the audit trail.
--
-- Each entry stores its position in its document's chain plus a SHA-256 over
-- its own content and the previous entry's hash.

ALTER TABLE "AuditLog" ADD COLUMN     "hash" TEXT,
ADD COLUMN     "prevHash" TEXT,
ADD COLUMN     "seq" INTEGER NOT NULL DEFAULT 0;

-- Backfill: number existing entries per document in timestamp order, so the
-- unique index below can be created. These rows keep hash = NULL on purpose —
-- they predate the chain and verifyChain() reports them as unchained rather
-- than pretending they were verified. Reseeding replaces them with real links.
WITH numbered AS (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY "documentId" ORDER BY "timestamp", "id") - 1 AS rn
  FROM "AuditLog"
)
UPDATE "AuditLog" a SET "seq" = n.rn FROM numbered n WHERE a."id" = n."id";

CREATE INDEX "AuditLog_documentId_seq_idx" ON "AuditLog"("documentId", "seq");
CREATE UNIQUE INDEX "AuditLog_documentId_seq_key" ON "AuditLog"("documentId", "seq");
