-- CreateEnum
CREATE TYPE "MutationType" AS ENUM ('ORIGINAL', 'SALE', 'INHERITANCE', 'GIFT', 'PARTITION', 'DECREE');

-- CreateTable
CREATE TABLE "Parcel" (
    "id" TEXT NOT NULL,
    "khasraNumber" TEXT NOT NULL,
    "village" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "tehsil" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Parcel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mutation" (
    "id" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "mutationNumber" TEXT,
    "type" "MutationType" NOT NULL,
    "fromOwner" TEXT,
    "toOwner" TEXT NOT NULL,
    "share" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderReference" TEXT,
    "sourceDocumentId" TEXT,
    "supersedesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mutation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Parcel_khasraNumber_village_district_key" ON "Parcel"("khasraNumber", "village", "district");

-- CreateIndex
CREATE INDEX "Mutation_parcelId_effectiveDate_idx" ON "Mutation"("parcelId", "effectiveDate");

-- AddForeignKey
ALTER TABLE "Mutation" ADD CONSTRAINT "Mutation_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "Parcel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
