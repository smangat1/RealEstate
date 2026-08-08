ALTER FUNCTION public.enforce_rentcast_request_limit()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.protect_recent_rentcast_request()
  SET search_path = pg_catalog, public;

CREATE INDEX IF NOT EXISTS "BoardInvitation_invitedByUserId_idx"
  ON public."BoardInvitation" ("invitedByUserId");

CREATE INDEX IF NOT EXISTS "BoardListingComment_roommateId_idx"
  ON public."BoardListingComment" ("roommateId");

CREATE INDEX IF NOT EXISTS "BoardListingRating_roommateId_idx"
  ON public."BoardListingRating" ("roommateId");

CREATE INDEX IF NOT EXISTS "BoardListingVote_roommateId_idx"
  ON public."BoardListingVote" ("roommateId");
