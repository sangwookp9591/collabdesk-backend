/*
  Warnings:

  - You are about to drop the column `dmId` on the `notifications` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."notifications" DROP CONSTRAINT "notifications_dmId_fkey";

-- AlterTable
ALTER TABLE "public"."notifications" DROP COLUMN "dmId",
ADD COLUMN     "dmConversationId" TEXT;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_dmConversationId_fkey" FOREIGN KEY ("dmConversationId") REFERENCES "public"."dm_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
