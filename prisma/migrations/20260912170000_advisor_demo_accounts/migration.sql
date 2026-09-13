-- Existing prelaunch accounts are demo accounts. New signups default to real accounts.
ALTER TABLE "User" ADD COLUMN "isDemoAccount" BOOLEAN NOT NULL DEFAULT false;
UPDATE "User" SET "isDemoAccount" = true WHERE "createdAt" < TIMESTAMP '2026-09-12 17:00:00';
