ALTER TABLE "SearchBoard"
ADD COLUMN "creationRequestId" TEXT;

CREATE UNIQUE INDEX "SearchBoard_creationRequestId_key"
ON "SearchBoard"("creationRequestId");
