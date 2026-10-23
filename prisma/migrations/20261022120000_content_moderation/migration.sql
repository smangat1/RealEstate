CREATE TABLE "UserBlock" (
  "blockerUserId" TEXT NOT NULL,
  "blockedUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("blockerUserId", "blockedUserId")
);

CREATE INDEX "UserBlock_blockedUserId_idx"
ON "UserBlock"("blockedUserId");

ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerUserId_fkey"
  FOREIGN KEY ("blockerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedUserId_fkey"
  FOREIGN KEY ("blockedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ContentReport" (
  "id" TEXT NOT NULL,
  "boardId" TEXT NOT NULL,
  "messageId" TEXT,
  "reportedUserId" TEXT,
  "reporterUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "details" TEXT NOT NULL,
  "contentSnapshot" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "ContentReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContentReport_reporterUserId_messageId_key"
ON "ContentReport"("reporterUserId", "messageId");
CREATE INDEX "ContentReport_status_createdAt_idx"
ON "ContentReport"("status", "createdAt");

ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_boardId_fkey"
  FOREIGN KEY ("boardId") REFERENCES "SearchBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_reportedUserId_fkey"
  FOREIGN KEY ("reportedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_reporterUserId_fkey"
  FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserBlock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContentReport" ENABLE ROW LEVEL SECURITY;

GRANT ALL PRIVILEGES ON TABLE "UserBlock" TO service_role;
GRANT ALL PRIVILEGES ON TABLE "ContentReport" TO service_role;
