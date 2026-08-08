alter table public."RoommateProfile"
  add column if not exists "budgetMin" integer,
  add column if not exists "stretchBudget" integer,
  add column if not exists "maxCommuteMinutes" integer;

alter table public."RoommateProfile"
  drop constraint if exists "RoommateProfile_budgetMin_nonnegative",
  add constraint "RoommateProfile_budgetMin_nonnegative"
    check ("budgetMin" is null or "budgetMin" >= 0),
  drop constraint if exists "RoommateProfile_budgetMax_nonnegative",
  add constraint "RoommateProfile_budgetMax_nonnegative"
    check ("budgetMax" is null or "budgetMax" >= 0),
  drop constraint if exists "RoommateProfile_stretchBudget_nonnegative",
  add constraint "RoommateProfile_stretchBudget_nonnegative"
    check ("stretchBudget" is null or "stretchBudget" >= 0),
  drop constraint if exists "RoommateProfile_maxCommuteMinutes_range",
  add constraint "RoommateProfile_maxCommuteMinutes_range"
    check (
      "maxCommuteMinutes" is null
      or ("maxCommuteMinutes" >= 1 and "maxCommuteMinutes" <= 300)
    ),
  drop constraint if exists "RoommateProfile_budget_order",
  add constraint "RoommateProfile_budget_order"
    check (
      ("budgetMin" is null or "budgetMax" is null or "budgetMin" <= "budgetMax")
      and ("stretchBudget" is null or "budgetMax" is null or "stretchBudget" >= "budgetMax")
    ),
  drop constraint if exists "RoommateProfile_commute_requires_address",
  add constraint "RoommateProfile_commute_requires_address"
    check ("maxCommuteMinutes" is null or nullif(btrim("commuteDestination"), '') is not null);
