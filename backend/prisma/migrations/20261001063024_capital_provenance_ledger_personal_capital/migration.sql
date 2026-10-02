-- CreateTable
CREATE TABLE "PersonalCapitalDeclaration" (
    "userId" TEXT NOT NULL,
    "amountUsdt" DECIMAL(36,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalCapitalDeclaration_pkey" PRIMARY KEY ("userId")
);
