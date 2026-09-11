-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('KHATAUNI', 'MUTATION_ORDER');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "documentType" "DocumentType" NOT NULL DEFAULT 'KHATAUNI';

-- CreateTable
CREATE TABLE "ExtractedMutation" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "mutationNumber" TEXT,
    "orderDate" TEXT,
    "mutationType" TEXT,
    "fromOwner" TEXT,
    "toOwner" TEXT,
    "share" TEXT,
    "khasraNumber" TEXT,
    "village" TEXT,
    "district" TEXT,
    "confidence" JSONB NOT NULL,
    "mutationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtractedMutation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExtractedMutation_documentId_key" ON "ExtractedMutation"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "ExtractedMutation_mutationId_key" ON "ExtractedMutation"("mutationId");

-- AddForeignKey
ALTER TABLE "ExtractedMutation" ADD CONSTRAINT "ExtractedMutation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
