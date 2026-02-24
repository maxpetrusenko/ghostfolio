-- CreateEnum
CREATE TYPE "public"."ChatMessageRole" AS ENUM ('ASSISTANT', 'USER');

-- CreateTable
CREATE TABLE "public"."ChatConversation" (
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "id" TEXT NOT NULL,
  "memorySessionId" TEXT,
  "title" TEXT NOT NULL DEFAULT 'New Chat',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "userId" TEXT NOT NULL,

  CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChatMessage" (
  "content" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "id" TEXT NOT NULL,
  "response" JSONB,
  "role" "public"."ChatMessageRole" NOT NULL,
  "sequence" INTEGER NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatConversation_memorySessionId_key" ON "public"."ChatConversation"("memorySessionId");

-- CreateIndex
CREATE INDEX "ChatConversation_updatedAt_idx" ON "public"."ChatConversation"("updatedAt");

-- CreateIndex
CREATE INDEX "ChatConversation_userId_updatedAt_idx" ON "public"."ChatConversation"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_conversationId_sequence_key" ON "public"."ChatMessage"("conversationId", "sequence");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_createdAt_idx" ON "public"."ChatMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."ChatConversation" ADD CONSTRAINT "ChatConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
