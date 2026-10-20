import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  allocateExpenseShares,
  boardExpenseCategories,
  boardExpenseCreateSchema,
  calculateExpenseBalances,
  normalizeExpenseShares,
  resolveRequestedSplitUserIds,
  sanitizeStoredExpenseShares,
  sanitizeStoredSplitUserIds,
} from "@/lib/group-finance";

const read = (path: string) => readFileSync(path, "utf8");

test("the third tab is a Group hub with chat and finance destinations", () => {
  const shell = read("ios/HomeboardNative/HomeboardNative/Sources/BoardShellView.swift");
  const finance = read("ios/HomeboardNative/HomeboardNative/Sources/FinanceWorkspaceView.swift");

  assert.match(shell, /SharedGroupHubView\(\)/);
  assert.match(shell, /Label\("Group", systemImage: "bubble\.left\.and\.bubble\.right\.fill"\)/);
  assert.doesNotMatch(shell, /Label\("Finance"/);
  assert.match(finance, /SharedUpdatesView\(showsBackButton: true\)/);
  assert.match(finance, /FinanceWorkspaceView\(showsBackButton: true\)/);
  assert.match(finance, /homeboard\.group\.chat-widget/);
  assert.match(finance, /homeboard\.group\.finance-widget/);
  assert.match(finance, /suffix\(4\)/);
  assert.match(finance, /\.frame\(minHeight: 390/);
  assert.match(finance, /Best fit:/);
  assert.match(finance, /Ledger ready without a listing/);
  assert.doesNotMatch(finance, /Chat keeps decisions visible/);
});

test("finance combines listing planning with a guided payment workflow", () => {
  const finance = read("ios/HomeboardNative/HomeboardNative/Sources/FinanceWorkspaceView.swift");

  assert.match(finance, /PLANNING FOR/);
  assert.match(finance, /ESTIMATED CASH TO MOVE IN/);
  assert.match(finance, /Application prep/);
  assert.match(finance, /Upfront cost plan/);
  assert.match(finance, /Monthly reality/);
  assert.match(finance, /RECORD A PAYMENT/);
  assert.match(finance, /Split between/);
  assert.doesNotMatch(finance, /Payments & balances/);
  assert.doesNotMatch(finance, /\.textFieldStyle\(\.roundedBorder\)/);
});

test("the ledger is always available and shortlist homes are compared by financial value", () => {
  const finance = read("ios/HomeboardNative/HomeboardNative/Sources/FinanceWorkspaceView.swift");

  assert.match(finance, /The ledger works with or without a listing/);
  assert.match(finance, /title: "Best financial options"/);
  assert.match(finance, /rankFinancialOptions/);
  assert.match(finance, /costPerBedroom/);
  assert.match(finance, /spacePerHundredDollars/);
  assert.match(finance, /bedroomFitLabel/);
  assert.match(finance, /General group expense/);
  assert.match(finance, /boardListingId: selectedListingID/);
  assert.match(finance, /WHO’S AHEAD/);
  assert.match(finance, /RECENT ENTRIES/);
  assert.doesNotMatch(finance, /private var ledgerCard: some View/);
  assert.doesNotMatch(finance, /Open Shortlist/);
});

test("application preparation asks concrete document questions and supplies guidance", () => {
  const finance = read("ios/HomeboardNative/HomeboardNative/Sources/FinanceWorkspaceView.swift");

  assert.match(finance, /FinanceIncomeProofChoice/);
  assert.match(finance, /Which proof of income will you use\?/);
  assert.match(finance, /Did you get the document ready\?/);
  assert.match(finance, /Will this application use a guarantor\?/);
  assert.match(finance, /What to prepare/);
  assert.match(finance, /Before you submit/);
  assert.match(finance, /The property accepts the income form you selected/);
  assert.doesNotMatch(finance, /FinanceReadinessToggle/);
  assert.doesNotMatch(finance, /FinanceReadinessItem/);
});

test("group, chat, and finance each have tutorial coverage", () => {
  const finance = read("ios/HomeboardNative/HomeboardNative/Sources/FinanceWorkspaceView.swift");
  const shared = read("ios/HomeboardNative/HomeboardNative/Sources/SharedWorkspaceView.swift");

  assert.match(finance, /homeboard\.guide\.group-hub\.dismissed/);
  assert.match(finance, /homeboard\.guide\.finance\.dismissed/);
  assert.match(shared, /Group hub: see recent conversation and money status/);
  assert.match(shared, /Group chat: discuss homes/);
  assert.match(shared, /Finance: compare rent, bedrooms, space, and move-in cash/);
  assert.match(shared, /keep money and application documents in Finance/);
});

test("tutorials spotlight one useful area per step", () => {
  const finance = read("ios/HomeboardNative/HomeboardNative/Sources/FinanceWorkspaceView.swift");
  const shared = read("ios/HomeboardNative/HomeboardNative/Sources/SharedWorkspaceView.swift");

  assert.match(finance, /group-hub-chat-widget/);
  assert.match(finance, /group-hub-finance-widget/);
  assert.match(finance, /actionLabel: "Next: Finance"/);
  assert.match(finance, /stepLabel: "1 of 2"/);
  assert.match(finance, /sharedCoachmarkTarget\("finance-comparison"\)/);
  assert.match(finance, /sharedCoachmarkTarget\("finance-readiness"\)/);
  assert.match(finance, /stepLabel: "2 of 3"/);
  assert.match(finance, /stepLabel: rankedListings\.isEmpty \? "2 of 2" : "3 of 3"/);
  assert.doesNotMatch(finance, /group-hub-widgets/);
  assert.doesNotMatch(finance, /LEDGER · HOME COMPARISON/);

  assert.match(shared, /sharedCoachmarkTarget\("updates-decisions"\)/);
  assert.match(shared, /actionLabel: "Next: Messages"/);
  assert.match(shared, /min\(max\(spotlightRect\.height \* 0\.08, 14\), 28\)/);
});

test("navigating away from a ledger refresh never surfaces cancellation as an error", () => {
  const appModel = read("ios/HomeboardNative/HomeboardNative/Sources/AppModel.swift");
  const loadExpenses = appModel.slice(
    appModel.indexOf("func loadBoardExpenses()"),
    appModel.indexOf("func optimizeRoomAssignment"),
  );

  assert.match(loadExpenses, /catch is CancellationError/);
  assert.match(loadExpenses, /return nil/);
});

test("new ledger entries preserve their listing, payer, and split participants", () => {
  const schema = read("prisma/schema.prisma");
  const route = read("app/api/mobile/boards/[id]/expenses/route.ts");
  const financeLogic = read("lib/group-finance.ts");
  const migration = read("prisma/migrations/20261019090000_listing_scoped_finance_ledger/migration.sql");

  assert.match(schema, /boardListingId String\?/);
  assert.match(schema, /splitUserIds\s+Json\?/);
  assert.match(schema, /splitShares\s+Json\?/);
  assert.match(schema, /paidByName\s+String\?/);
  assert.match(financeLogic, /paidByUserId: z\.string/);
  assert.match(financeLogic, /splitUserIds: z\.array/);
  assert.match(financeLogic, /boardListingId: z\.string/);
  assert.match(financeLogic, /"first_month_rent"/);
  assert.match(financeLogic, /"security_deposit"/);
  assert.match(route, /Every split participant must be on this board/);
  assert.match(route, /The selected listing is not on this board/);
  assert.match(migration, /FOREIGN KEY \("boardListingId"\)/);
  assert.match(migration, /ADD COLUMN "splitShares" JSONB/);
  assert.match(migration, /ADD COLUMN "paidByName" TEXT/);
});

test("the finance ledger accepts housing costs and rejects malformed entries", () => {
  for (const category of boardExpenseCategories) {
    assert.equal(boardExpenseCreateSchema.safeParse({
      description: "Shared housing cost",
      category,
      amountCents: 1,
    }).success, true);
  }

  for (const invalid of [
    { description: "", category: "application_fee", amountCents: 100 },
    { description: "Fee", category: "groceries", amountCents: 100 },
    { description: "Fee", category: "application_fee", amountCents: 0 },
    { description: "Fee", category: "application_fee", amountCents: 10.5 },
    { description: "Fee", category: "application_fee", amountCents: 100, splitUserIds: [] },
  ]) {
    assert.equal(boardExpenseCreateSchema.safeParse(invalid).success, false);
  }
});

test("requested splits reject outsiders and remove duplicate board members", () => {
  assert.deepEqual(resolveRequestedSplitUserIds(undefined, ["sam", "maya", "jordan"]), [
    "sam",
    "maya",
    "jordan",
  ]);
  assert.deepEqual(resolveRequestedSplitUserIds(["sam", "sam", "maya"], ["sam", "maya"]), [
    "sam",
    "maya",
  ]);
  assert.equal(resolveRequestedSplitUserIds(["sam", "outsider"], ["sam", "maya"]), null);
});

test("stored legacy splits keep historical ids and safely discard malformed values", () => {
  assert.deepEqual(sanitizeStoredSplitUserIds(["sam", 42, "former", "sam", " maya "]), [
    "sam",
    "former",
    "maya",
  ]);
  assert.deepEqual(sanitizeStoredSplitUserIds(null), []);
  assert.deepEqual(sanitizeStoredExpenseShares([
    { userId: "sam", name: "Sam", owedCents: 51 },
    { userId: "former", name: "Former roommate", owedCents: 50 },
  ], 101), [
    { userId: "sam", name: "Sam", owedCents: 51 },
    { userId: "former", name: "Former roommate", owedCents: 50 },
  ]);
  assert.deepEqual(sanitizeStoredExpenseShares([
    { userId: "sam", name: "Sam", owedCents: 50 },
  ], 101), []);
});

test("a departing split participant keeps the original penny allocation and zero-sum balance", () => {
  const names = new Map([
    ["sam", "Sam"],
    ["maya", "Maya"],
    ["jordan", "Jordan"],
  ]);
  const savedShares = allocateExpenseShares(100, ["sam", "maya", "jordan"], names);
  assert.deepEqual(savedShares.map((share) => share.owedCents), [34, 33, 33]);

  const restoredShares = normalizeExpenseShares({
    amountCents: 100,
    storedShares: savedShares,
    storedSplitUserIds: ["sam", "maya", "jordan"],
    fallbackUserIds: ["sam", "maya"],
    memberNames: new Map([["sam", "Sam"], ["maya", "Maya"]]),
  });
  assert.deepEqual(restoredShares, savedShares);

  const balances = calculateExpenseBalances([
    { amountCents: 100, paidByUserId: "sam", paidByName: "Sam", shares: restoredShares },
  ], [
    { id: "sam", name: "Sam" },
    { id: "maya", name: "Maya" },
  ]);
  assert.deepEqual(balances, [
    { userId: "sam", name: "Sam", paidCents: 100, owedCents: 34, balanceCents: 66 },
    { userId: "maya", name: "Maya", paidCents: 0, owedCents: 33, balanceCents: -33 },
    { userId: "jordan", name: "Jordan", paidCents: 0, owedCents: 33, balanceCents: -33 },
  ]);
  assert.equal(balances.reduce((sum, balance) => sum + balance.balanceCents, 0), 0);
});

test("a departing payer remains in accounting and balances still net to zero", () => {
  const shares = [
    { userId: "sam", name: "Sam", owedCents: 75 },
    { userId: "maya", name: "Maya", owedCents: 75 },
  ];
  const balances = calculateExpenseBalances([
    {
      amountCents: 150,
      paidByUserId: "jordan",
      paidByName: "Jordan (former roommate)",
      shares,
    },
  ], [
    { id: "sam", name: "Sam" },
    { id: "maya", name: "Maya" },
  ]);
  assert.deepEqual(balances, [
    { userId: "sam", name: "Sam", paidCents: 0, owedCents: 75, balanceCents: -75 },
    { userId: "maya", name: "Maya", paidCents: 0, owedCents: 75, balanceCents: -75 },
    { userId: "jordan", name: "Jordan (former roommate)", paidCents: 150, owedCents: 0, balanceCents: 150 },
  ]);
  assert.equal(balances.reduce((sum, balance) => sum + balance.balanceCents, 0), 0);
});

test("equal splits preserve every cent and balances net to zero", () => {
  const names = new Map([
    ["sam", "Sam"],
    ["maya", "Maya"],
    ["jordan", "Jordan"],
  ]);
  const applicationShares = allocateExpenseShares(225, ["sam", "maya", "jordan"], names);
  const holdingShares = allocateExpenseShares(101, ["maya", "jordan"], names);

  assert.deepEqual(applicationShares.map((share) => share.owedCents), [75, 75, 75]);
  assert.deepEqual(holdingShares.map((share) => share.owedCents), [51, 50]);
  assert.equal(holdingShares.reduce((sum, share) => sum + share.owedCents, 0), 101);

  const balances = calculateExpenseBalances([
    { amountCents: 225, paidByUserId: "sam", shares: applicationShares },
    { amountCents: 101, paidByUserId: "maya", shares: holdingShares },
  ], [
    { id: "sam", name: "Sam" },
    { id: "maya", name: "Maya" },
    { id: "jordan", name: "Jordan" },
  ]);

  assert.deepEqual(balances, [
    { userId: "sam", name: "Sam", paidCents: 225, owedCents: 75, balanceCents: 150 },
    { userId: "maya", name: "Maya", paidCents: 101, owedCents: 126, balanceCents: -25 },
    { userId: "jordan", name: "Jordan", paidCents: 0, owedCents: 125, balanceCents: -125 },
  ]);
  assert.equal(balances.reduce((sum, balance) => sum + balance.balanceCents, 0), 0);
});
