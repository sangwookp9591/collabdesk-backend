-- CreateEnum
CREATE TYPE "public"."MessageType" AS ENUM ('USER', 'SYSTEM', 'BOT');

-- AlterTable
ALTER TABLE "public"."messages" ADD COLUMN     "messageType" "public"."MessageType" NOT NULL DEFAULT 'USER',
ADD COLUMN     "systemData" JSONB,
ALTER COLUMN "userId" DROP NOT NULL;
