-- CreateEnum
CREATE TYPE "BorrowPositionStatus" AS ENUM ('OPEN', 'REPAID', 'DRIFT_DETECTED');

-- CreateEnum
CREATE TYPE "AllocationAsset" AS ENUM ('BTC', 'ETH');

-- CreateEnum
CREATE TYPE "AllocationFundingSource" AS ENUM ('PERSONAL', 'BORROW');

-- CreateEnum
CREATE TYPE "LedgerEventType" AS ENUM ('BORROW_OPENED', 'ASSET_SOLD', 'ASSET_BOUGHT', 'LOT_SOLD', 'REPAY', 'CORRECTION', 'DUST_WRITTEN_OFF');

-- CreateTable
CREATE TABLE "BorrowPosition" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "borrowedAsset" TEXT NOT NULL,
    "quantity" DECIMAL(36,18) NOT NULL,
    "firstBorrowEntryPrice" DECIMAL(36,18) NOT NULL,
    "liabilityLedger" DECIMAL(36,18) NOT NULL,
    "liabilityBinanceLast" DECIMAL(36,18),
    "reservedAmountUsdt" DECIMAL(36,2) NOT NULL DEFAULT 0,
    "status" "BorrowPositionStatus" NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "repaidAt" TIMESTAMP(3),

    CONSTRAINT "BorrowPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllocationLot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "asset" "AllocationAsset" NOT NULL,
    "quantity" DECIMAL(36,18) NOT NULL,
    "remainingQuantity" DECIMAL(36,18) NOT NULL,
    "costBasisUsdt" DECIMAL(36,2) NOT NULL,
    "fundingSource" "AllocationFundingSource" NOT NULL,
    "fundingBorrowPositionId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllocationLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "LedgerEventType" NOT NULL,
    "borrowPositionId" TEXT,
    "allocationLotId" TEXT,
    "payload" JSONB NOT NULL,
    "correctsEventId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BorrowPosition_userId_idx" ON "BorrowPosition"("userId");

-- CreateIndex
CREATE INDEX "BorrowPosition_userId_borrowedAsset_idx" ON "BorrowPosition"("userId", "borrowedAsset");

-- CreateIndex
CREATE INDEX "AllocationLot_userId_idx" ON "AllocationLot"("userId");

-- CreateIndex
CREATE INDEX "AllocationLot_fundingBorrowPositionId_idx" ON "AllocationLot"("fundingBorrowPositionId");

-- CreateIndex
CREATE INDEX "LedgerEvent_userId_idx" ON "LedgerEvent"("userId");

-- CreateIndex
CREATE INDEX "LedgerEvent_borrowPositionId_idx" ON "LedgerEvent"("borrowPositionId");

-- CreateIndex
CREATE INDEX "LedgerEvent_allocationLotId_idx" ON "LedgerEvent"("allocationLotId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEvent_userId_idempotencyKey_key" ON "LedgerEvent"("userId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "AllocationLot" ADD CONSTRAINT "AllocationLot_fundingBorrowPositionId_fkey" FOREIGN KEY ("fundingBorrowPositionId") REFERENCES "BorrowPosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Partial unique index (BR-002): at most 1 OPEN BorrowPosition per (userId, borrowedAsset).
-- Not expressible in schema.prisma (no WHERE clause support), added by hand per
-- architecture/capital-provenance-ledger.md "Domain / storage / ledger".
CREATE UNIQUE INDEX "BorrowPosition_user_asset_open_unique" ON "BorrowPosition" ("userId", "borrowedAsset") WHERE "status" = 'OPEN';
