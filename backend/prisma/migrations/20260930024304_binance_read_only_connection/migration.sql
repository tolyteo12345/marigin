-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('PENDING_VERIFY', 'VERIFIED', 'INVALID', 'UNSUPPORTED_ACCOUNT_MODE', 'VERIFY_UNKNOWN', 'REVOKED');

-- CreateTable
CREATE TABLE "BinanceConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "encryptedApiKey" BYTEA NOT NULL,
    "encryptedApiSecret" BYTEA NOT NULL,
    "encryptionIv" BYTEA NOT NULL,
    "encryptionKeyVersion" INTEGER NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'PENDING_VERIFY',
    "accountType" TEXT,
    "permissionSnapshot" JSONB,
    "permissionUnknown" BOOLEAN NOT NULL DEFAULT false,
    "lastError" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BinanceConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectionAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "requestCorrelationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detailsRedacted" JSONB,

    CONSTRAINT "ConnectionAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BinanceConnection_userId_idx" ON "BinanceConnection"("userId");

-- CreateIndex
CREATE INDEX "ConnectionAuditLog_userId_idx" ON "ConnectionAuditLog"("userId");

-- CreateIndex
CREATE INDEX "ConnectionAuditLog_connectionId_idx" ON "ConnectionAuditLog"("connectionId");
