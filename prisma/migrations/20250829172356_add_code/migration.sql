/*
  Warnings:

  - You are about to drop the column `token` on the `channel_invites` table. All the data in the column will be lost.
  - You are about to drop the column `token` on the `workspace_invites` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[code]` on the table `channel_invites` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[code]` on the table `workspace_invites` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `code` to the `channel_invites` table without a default value. This is not possible if the table is not empty.
  - Added the required column `code` to the `workspace_invites` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."channel_invites_token_key";

-- DropIndex
DROP INDEX "public"."workspace_invites_token_key";

-- AlterTable
ALTER TABLE "public"."channel_invites" DROP COLUMN "token",
ADD COLUMN     "code" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."workspace_invites" DROP COLUMN "token",
ADD COLUMN     "code" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "channel_invites_code_key" ON "public"."channel_invites"("code");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_invites_code_key" ON "public"."workspace_invites"("code");
