CREATE TABLE "ChatMessageReply" (
  "messageId" TEXT NOT NULL,
  "replyToMessageId" TEXT NOT NULL,
  "boardId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessageReply_pkey" PRIMARY KEY ("messageId")
);

CREATE INDEX "ChatMessageReply_boardId_idx"
ON "ChatMessageReply"("boardId");
CREATE INDEX "ChatMessageReply_replyToMessageId_idx"
ON "ChatMessageReply"("replyToMessageId");

ALTER TABLE "ChatMessageReply" ADD CONSTRAINT "ChatMessageReply_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessageReply" ADD CONSTRAINT "ChatMessageReply_replyToMessageId_fkey"
  FOREIGN KEY ("replyToMessageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessageReply" ADD CONSTRAINT "ChatMessageReply_boardId_fkey"
  FOREIGN KEY ("boardId") REFERENCES "SearchBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatMessageReply" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat replies are visible to board members"
ON "ChatMessageReply"
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM "SearchBoard" board
    JOIN "User" owner_user ON owner_user."id" = board."userId"
    WHERE board."id" = "ChatMessageReply"."boardId"
      AND owner_user."authUserId" = auth.uid()::text
  )
  OR EXISTS (
    SELECT 1
    FROM "BoardMember" member
    JOIN "User" member_user ON member_user."id" = member."userId"
    WHERE member."boardId" = "ChatMessageReply"."boardId"
      AND member_user."authUserId" = auth.uid()::text
  )
);

CREATE POLICY "chat replies can be created by board members"
ON "ChatMessageReply"
FOR INSERT
TO authenticated
WITH CHECK (
  (
    EXISTS (
      SELECT 1
      FROM "SearchBoard" board
      JOIN "User" owner_user ON owner_user."id" = board."userId"
      WHERE board."id" = "ChatMessageReply"."boardId"
        AND owner_user."authUserId" = auth.uid()::text
    )
    OR EXISTS (
      SELECT 1
      FROM "BoardMember" member
      JOIN "User" member_user ON member_user."id" = member."userId"
      WHERE member."boardId" = "ChatMessageReply"."boardId"
        AND member_user."authUserId" = auth.uid()::text
    )
  )
  AND EXISTS (
    SELECT 1 FROM "ChatMessage" message
    WHERE message."id" = "ChatMessageReply"."messageId"
      AND message."boardId" = "ChatMessageReply"."boardId"
  )
  AND EXISTS (
    SELECT 1 FROM "ChatMessage" target
    WHERE target."id" = "ChatMessageReply"."replyToMessageId"
      AND target."boardId" = "ChatMessageReply"."boardId"
  )
);

GRANT SELECT ON TABLE "ChatMessageReply" TO anon;
GRANT SELECT, INSERT ON TABLE "ChatMessageReply" TO authenticated;
GRANT ALL PRIVILEGES ON TABLE "ChatMessageReply" TO service_role;
