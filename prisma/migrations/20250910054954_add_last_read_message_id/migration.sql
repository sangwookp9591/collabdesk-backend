-- AlterTable
ALTER TABLE "public"."channel_members" ADD COLUMN     "lastReadMessageId" TEXT;

-- AlterTable
ALTER TABLE "public"."dm_conversations" ADD COLUMN     "user1LastReadMessageId" TEXT,
ADD COLUMN     "user2LastReadMessageId" TEXT;
