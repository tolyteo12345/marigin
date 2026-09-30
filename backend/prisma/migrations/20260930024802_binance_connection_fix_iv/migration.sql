/*
  Warnings:

  - Added the required column `encryptionIvApiSecret` to the `BinanceConnection` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "BinanceConnection" ADD COLUMN     "encryptionIvApiSecret" BYTEA NOT NULL;
