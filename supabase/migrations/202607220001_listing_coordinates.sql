alter table public."Listing"
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

create index if not exists "Listing_latitude_longitude_idx"
  on public."Listing" (latitude, longitude);
