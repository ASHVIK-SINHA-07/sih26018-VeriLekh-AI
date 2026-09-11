-- CreateEnum
CREATE TYPE "AuthoritativeSource" AS ENUM ('ROR', 'REGISTRATION', 'CADASTRAL');

-- CreateTable
CREATE TABLE "AuthoritativeRecord" (
    "id" TEXT NOT NULL,
    "source" "AuthoritativeSource" NOT NULL,
    "khasraNumber" TEXT NOT NULL,
    "village" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "ownerName" TEXT,
    "khataNumber" TEXT,
    "plotArea" TEXT,
    "landClassification" TEXT,
    "asOf" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthoritativeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthoritativeRecord_khasraNumber_village_district_idx" ON "AuthoritativeRecord"("khasraNumber", "village", "district");
