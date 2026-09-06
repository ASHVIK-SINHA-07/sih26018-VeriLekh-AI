-- CreateTable
CREATE TABLE "LearnedCorrection" (
    "id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "wrongValue" TEXT NOT NULL,
    "rightValue" TEXT NOT NULL,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "applied" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnedCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LearnedCorrection_field_idx" ON "LearnedCorrection"("field");

-- CreateIndex
CREATE UNIQUE INDEX "LearnedCorrection_field_wrongValue_key" ON "LearnedCorrection"("field", "wrongValue");
