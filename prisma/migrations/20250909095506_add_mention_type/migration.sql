-- CreateEnum
CREATE TYPE "public"."MentionType" AS ENUM ('USER', 'HERE', 'EVERYONE');

-- AlterTable
ALTER TABLE "public"."mentions" ADD COLUMN     "type" "public"."MentionType" NOT NULL DEFAULT 'USER',
ALTER COLUMN "userId" DROP NOT NULL;
