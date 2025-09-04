/*
  Warnings:

  - A unique constraint covering the columns `[workspaceId,user1Id,user2Id]` on the table `dm_conversations` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `workspaceId` to the `dm_conversations` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."dm_conversations_user1Id_user2Id_key";

-- AlterTable
ALTER TABLE "public"."dm_conversations" ADD COLUMN     "workspaceId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "dm_conversations_workspaceId_user1Id_user2Id_key" ON "public"."dm_conversations"("workspaceId", "user1Id", "user2Id");

-- AddForeignKey
ALTER TABLE "public"."dm_conversations" ADD CONSTRAINT "dm_conversations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
