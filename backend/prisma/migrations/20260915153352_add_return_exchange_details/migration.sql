/*
  Warnings:

  - Added the required column `processedById` to the `Return` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ReturnType" AS ENUM ('return', 'exchange');

-- DropIndex
DROP INDEX "Return_orderId_idx";

-- AlterTable
ALTER TABLE "Return" ADD COLUMN     "amountDue" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "exchangeUnitPrice" DECIMAL(10,2),
ADD COLUMN     "exchangeVariantId" INTEGER,
ADD COLUMN     "processedById" INTEGER NOT NULL,
ADD COLUMN     "type" "ReturnType" NOT NULL DEFAULT 'return';

-- CreateIndex
CREATE INDEX "Return_orderId_variantId_idx" ON "Return"("orderId", "variantId");

-- CreateIndex
CREATE INDEX "Return_exchangeVariantId_idx" ON "Return"("exchangeVariantId");

-- CreateIndex
CREATE INDEX "Return_processedById_idx" ON "Return"("processedById");

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_exchangeVariantId_fkey" FOREIGN KEY ("exchangeVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
