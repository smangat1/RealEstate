import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { faker } from "@faker-js/faker";

type ScaleName = "demo" | "large" | "huge";

type GenerationConfig = {
  users: number;
  boards: number;
  listings: number;
  maxListingsPerBoard: number;
  minListingsPerBoard: number;
  chatMessagesPerBoard: number;
  maxPriceHistoryEntries: number;
  reset: boolean;
  seed: number;
  dbPath: string;
};

const SCALE_PRESETS: Record<ScaleName, Omit<GenerationConfig, "reset" | "seed" | "dbPath">> = {
  demo: {
    users: 4,
    boards: 10,
    listings: 120,
    minListingsPerBoard: 8,
    maxListingsPerBoard: 20,
    chatMessagesPerBoard: 10,
    maxPriceHistoryEntries: 4,
  },
  large: {
    users: 25,
    boards: 120,
    listings: 1800,
    minListingsPerBoard: 12,
    maxListingsPerBoard: 36,
    chatMessagesPerBoard: 14,
    maxPriceHistoryEntries: 6,
  },
  huge: {
    users: 80,
    boards: 450,
    listings: 12000,
    minListingsPerBoard: 18,
    maxListingsPerBoard: 55,
    chatMessagesPerBoard: 18,
    maxPriceHistoryEntries: 8,
  },
};

const MARKETS = [
  {
    city: "Jersey City",
    state: "NJ",
    neighborhoods: ["Downtown", "Journal Square", "The Heights", "Newport", "Bergen-Lafayette"],
  },
  {
    city: "Hoboken",
    state: "NJ",
    neighborhoods: ["Southwest", "Uptown", "Midtown", "Waterfront", "Northwest"],
  },
  {
    city: "Brooklyn",
    state: "NY",
    neighborhoods: ["Williamsburg", "Greenpoint", "Bushwick", "Downtown Brooklyn", "Park Slope"],
  },
  {
    city: "Queens",
    state: "NY",
    neighborhoods: ["Astoria", "Long Island City", "Sunnyside", "Forest Hills", "Jackson Heights"],
  },
  {
    city: "New York",
    state: "NY",
    neighborhoods: ["Upper West Side", "Harlem", "East Village", "Midtown", "Financial District"],
  },
];

const MUST_HAVES = ["laundry", "dishwasher", "natural light", "pet friendly", "doorman", "gym"];
const NICE_TO_HAVES = ["parking", "outdoor space", "elevator", "storage", "view", "new construction"];
const DEALBREAKERS = ["broker fee", "walk-up", "street noise", "tiny bedroom", "no pets", "far from train"];
const COMMUTE_TARGETS = [
  "PATH to World Trade Center under 35 minutes",
  "Midtown under 45 minutes",
  "Downtown Jersey City with easy PATH access",
  "Near Grove Street or Newport PATH",
  "Under 20 minutes to Exchange Place",
];
const PRIORITY_LEVELS = ["low", "medium", "high"] as const;
const ROOMMATE_ROLES = ["planner", "commute realist", "neighborhood scout", "budget guard", "dealbreaker radar"];
const VOTE_TYPES = ["love", "like", "maybe", "pass", "veto"] as const;

function toInt(value: string | boolean | undefined, fallback: number): number {
  if (typeof value !== "string") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseArgs(): GenerationConfig {
  const args = process.argv.slice(2);
  const argMap = new Map<string, string | boolean>();

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (!current.startsWith("--")) {
      continue;
    }

    const key = current.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      argMap.set(key, true);
      continue;
    }

    argMap.set(key, next);
    index += 1;
  }

  const scale = (argMap.get("scale") as ScaleName | undefined) ?? "demo";
  const preset = SCALE_PRESETS[scale] ?? SCALE_PRESETS.demo;
  const dbPathArg = argMap.get("dbPath");

  return {
    ...preset,
    reset: Boolean(argMap.get("reset")),
    seed: toInt(argMap.get("seed"), 42),
    dbPath: typeof dbPathArg === "string" ? dbPathArg : path.resolve(process.cwd(), "data", "rental-advisor.db"),
    users: toInt(argMap.get("users"), preset.users),
    boards: toInt(argMap.get("boards"), preset.boards),
    listings: toInt(argMap.get("listings"), preset.listings),
    minListingsPerBoard: toInt(argMap.get("minListingsPerBoard"), preset.minListingsPerBoard),
    maxListingsPerBoard: toInt(argMap.get("maxListingsPerBoard"), preset.maxListingsPerBoard),
    chatMessagesPerBoard: toInt(argMap.get("chatMessagesPerBoard"), preset.chatMessagesPerBoard),
    maxPriceHistoryEntries: toInt(argMap.get("maxPriceHistoryEntries"), preset.maxPriceHistoryEntries),
  };
}

function asJson(value: unknown): string {
  return JSON.stringify(value);
}

function pickOne<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)] as T;
}

function pickSome(values: readonly string[], min = 1, max = 3): string[] {
  return faker.helpers.arrayElements(values, {
    min,
    max: Math.min(max, values.length),
  });
}

function maybeBoolean(preferred = 0.5): boolean | null {
  if (Math.random() < 0.15) {
    return null;
  }
  return Math.random() < preferred;
}

function toSqlBoolean(value: boolean | null): number | null {
  if (value === null) {
    return null;
  }

  return value ? 1 : 0;
}

function generatePriorities() {
  return {
    price: pickOne(PRIORITY_LEVELS),
    space: pickOne(PRIORITY_LEVELS),
    commute: pickOne(PRIORITY_LEVELS),
    neighborhood: pickOne(PRIORITY_LEVELS),
    amenities: pickOne(PRIORITY_LEVELS),
  };
}

function buildAnalysis(neighborhood: string, price: number, squareFeet: number | null): string {
  const sizeLine = squareFeet
    ? `The size looks workable at around ${squareFeet} square feet, although the layout quality still matters.`
    : "The listing does not clearly say how much space you are getting, which makes it harder to judge value.";

  return `This feels like a practical option for someone balancing price and flexibility. At about $${price.toLocaleString()} in ${neighborhood}, it could make sense if budget matters more than having every premium feature. ${sizeLine} The biggest issue is that some details are still incomplete, so it is worth treating this as a candidate to investigate rather than a sure thing.`;
}

function buildSummary(city: string, neighborhood: string, price: number): string {
  return `Saved listing in ${neighborhood}, ${city} around $${price.toLocaleString()} with a generally solid first impression but a few open questions.`;
}

function buildRedFlags(): string[] {
  return faker.helpers.arrayElements(
    [
      "Broker fee is unclear",
      "Utilities are not fully explained",
      "Listing photos may be limited",
      "Available date needs confirmation",
      "Laundry setup is not clearly stated",
      "Square footage may be estimated",
    ],
    { min: 1, max: 3 },
  );
}

function buildQuestions(): string[] {
  return faker.helpers.arrayElements(
    [
      "Can you confirm the full move-in cost, including any broker or application fees?",
      "Is laundry in-unit, in-building, or off-site?",
      "Has the unit been updated recently, and are the photos current?",
      "What utilities are included in the rent?",
      "Is the advertised availability date firm?",
      "Are pets allowed, and if so, are there any restrictions or fees?",
    ],
    { min: 2, max: 4 },
  );
}

function generateConversation(timeframe: string, locations: string[]): string[] {
  const firstLocation = locations[0] ?? "the area";

  return [
    `Hi, I am looking for a rental around ${firstLocation}.`,
    `I would love to stay near ${locations.join(" or ")} if possible.`,
    "I care a lot about price and commute.",
    `I am hoping to move around ${timeframe}.`,
    "Laundry would be great and I am flexible on parking.",
    "Please keep an eye out for any major fees or missing details.",
  ];
}

function initializeDatabase(db: Database.Database) {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS searchBoards (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      title TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS searchProfiles (
      id TEXT PRIMARY KEY,
      boardId TEXT NOT NULL UNIQUE,
      intent TEXT,
      propertyType TEXT,
      locations TEXT,
      budgetMin INTEGER,
      budgetMax INTEGER,
      bedroomsPreferred INTEGER,
      bedroomsFlexible TEXT,
      moveInTimeframe TEXT,
      mustHaves TEXT,
      niceToHaves TEXT,
      dealbreakers TEXT,
      priorities TEXT,
      petsRequired INTEGER,
      parkingRequired INTEGER,
      laundryRequired INTEGER,
      commuteTarget TEXT,
      notes TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (boardId) REFERENCES searchBoards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      sourceName TEXT,
      sourceUrl TEXT,
      externalId TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      neighborhood TEXT,
      price INTEGER,
      bedrooms REAL,
      bathrooms REAL,
      squareFeet INTEGER,
      availableDate TEXT,
      propertyType TEXT,
      amenities TEXT,
      fees TEXT,
      description TEXT,
      images TEXT,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS boardListings (
      id TEXT PRIMARY KEY,
      boardId TEXT NOT NULL,
      listingId TEXT NOT NULL,
      userStatus TEXT NOT NULL,
      userNotes TEXT,
      aiSummary TEXT,
      aiTradeoffAnalysis TEXT,
      aiRedFlags TEXT,
      questionsToAsk TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (boardId) REFERENCES searchBoards(id) ON DELETE CASCADE,
      FOREIGN KEY (listingId) REFERENCES listings(id) ON DELETE CASCADE,
      UNIQUE (boardId, listingId)
    );

    CREATE TABLE IF NOT EXISTS priceHistory (
      id TEXT PRIMARY KEY,
      listingId TEXT NOT NULL,
      price INTEGER NOT NULL,
      observedAt TEXT NOT NULL,
      source TEXT NOT NULL,
      FOREIGN KEY (listingId) REFERENCES listings(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chatMessages (
      id TEXT PRIMARY KEY,
      boardId TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (boardId) REFERENCES searchBoards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS roommateProfiles (
      id TEXT PRIMARY KEY,
      boardId TEXT NOT NULL,
      name TEXT NOT NULL,
      roleLabel TEXT NOT NULL,
      budgetMax INTEGER,
      commuteDestination TEXT,
      commutePriority TEXT NOT NULL,
      neighborhoodPriority TEXT NOT NULL,
      spacePriority TEXT NOT NULL,
      privacyPriority TEXT NOT NULL,
      preferredNeighborhoods TEXT,
      mustHaves TEXT,
      dealbreakers TEXT,
      notes TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (boardId) REFERENCES searchBoards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS boardListingVotes (
      id TEXT PRIMARY KEY,
      boardListingId TEXT NOT NULL,
      roommateId TEXT NOT NULL,
      vote TEXT NOT NULL,
      note TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (boardListingId) REFERENCES boardListings(id) ON DELETE CASCADE,
      FOREIGN KEY (roommateId) REFERENCES roommateProfiles(id) ON DELETE CASCADE,
      UNIQUE (boardListingId, roommateId)
    );

    CREATE TABLE IF NOT EXISTS boardListingComments (
      id TEXT PRIMARY KEY,
      boardListingId TEXT NOT NULL,
      roommateId TEXT NOT NULL,
      content TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (boardListingId) REFERENCES boardListings(id) ON DELETE CASCADE,
      FOREIGN KEY (roommateId) REFERENCES roommateProfiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS boardEvents (
      id TEXT PRIMARY KEY,
      boardId TEXT NOT NULL,
      actorType TEXT NOT NULL,
      actorName TEXT NOT NULL,
      eventType TEXT NOT NULL,
      content TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (boardId) REFERENCES searchBoards(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_searchBoards_userId ON searchBoards(userId);
    CREATE INDEX IF NOT EXISTS idx_searchProfiles_boardId ON searchProfiles(boardId);
    CREATE INDEX IF NOT EXISTS idx_listings_source ON listings(source);
    CREATE INDEX IF NOT EXISTS idx_listings_city_neighborhood ON listings(city, neighborhood);
    CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(price);
    CREATE INDEX IF NOT EXISTS idx_boardListings_boardId_status ON boardListings(boardId, userStatus);
    CREATE INDEX IF NOT EXISTS idx_boardListings_listingId ON boardListings(listingId);
    CREATE INDEX IF NOT EXISTS idx_priceHistory_listingId_observedAt ON priceHistory(listingId, observedAt);
    CREATE INDEX IF NOT EXISTS idx_chatMessages_boardId_createdAt ON chatMessages(boardId, createdAt);
    CREATE INDEX IF NOT EXISTS idx_roommateProfiles_boardId ON roommateProfiles(boardId);
    CREATE INDEX IF NOT EXISTS idx_boardListingVotes_boardListingId ON boardListingVotes(boardListingId);
    CREATE INDEX IF NOT EXISTS idx_boardListingComments_boardListingId_createdAt ON boardListingComments(boardListingId, createdAt);
    CREATE INDEX IF NOT EXISTS idx_boardEvents_boardId_createdAt ON boardEvents(boardId, createdAt);
  `);
}

function resetDatabase(db: Database.Database) {
  db.exec(`
    DELETE FROM priceHistory;
    DELETE FROM chatMessages;
    DELETE FROM boardListingVotes;
    DELETE FROM boardListingComments;
    DELETE FROM boardEvents;
    DELETE FROM boardListings;
    DELETE FROM roommateProfiles;
    DELETE FROM searchProfiles;
    DELETE FROM listings;
    DELETE FROM searchBoards;
    DELETE FROM users;
  `);
}

function main() {
  const config = parseArgs();
  faker.seed(config.seed);

  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  const db = new Database(config.dbPath);
  initializeDatabase(db);

  if (config.reset) {
    console.log("Resetting existing data...");
    resetDatabase(db);
  }

  const users = Array.from({ length: config.users }, () => ({
    id: faker.string.uuid(),
    createdAt: faker.date.past({ years: 1 }).toISOString(),
  }));

  const boards = Array.from({ length: config.boards }, () => {
    const createdAt = faker.date.recent({ days: 45 });
    return {
      id: faker.string.uuid(),
      userId: faker.helpers.arrayElement(users).id,
      title: `${faker.person.firstName()}'s ${faker.helpers.arrayElement(["Summer", "Relocation", "Commute-Friendly", "Budget-Focused", "Lifestyle"])} Search`,
      createdAt: createdAt.toISOString(),
      updatedAt: faker.date.between({ from: createdAt, to: new Date() }).toISOString(),
    };
  });

  const profiles = boards.map((board) => {
    const market = faker.helpers.arrayElement(MARKETS);
    const locations = faker.helpers.arrayElements(market.neighborhoods, {
      min: 1,
      max: Math.min(3, market.neighborhoods.length),
    });
    const budgetMin = faker.number.int({ min: 1400, max: 3200 });
    const budgetMax = budgetMin + faker.number.int({ min: 250, max: 1800 });
    const bedroomsPreferred = faker.helpers.arrayElement([0, 1, 1, 2, 2, 3]);
    const timeframe = faker.helpers.arrayElement(["ASAP", "July", "August", "September", "October", "Within 90 days"]);

    return {
      id: faker.string.uuid(),
      boardId: board.id,
      intent: "rent",
      propertyType: faker.helpers.arrayElement(["apartment", "apartment", "condo", "room"]),
      locations: asJson(locations),
      budgetMin,
      budgetMax,
      bedroomsPreferred,
      bedroomsFlexible: asJson(
        bedroomsPreferred === 0 ? ["studio", "1 bed"] : ["studio", `${bedroomsPreferred} bed`],
      ),
      moveInTimeframe: timeframe,
      mustHaves: asJson(pickSome(MUST_HAVES, 1, 3)),
      niceToHaves: asJson(pickSome(NICE_TO_HAVES, 1, 3)),
      dealbreakers: asJson(pickSome(DEALBREAKERS, 1, 2)),
      priorities: asJson(generatePriorities()),
      petsRequired: toSqlBoolean(maybeBoolean(0.35)),
      parkingRequired: toSqlBoolean(maybeBoolean(0.25)),
      laundryRequired: toSqlBoolean(maybeBoolean(0.5)),
      commuteTarget: faker.helpers.arrayElement(COMMUTE_TARGETS),
      notes:
        faker.helpers.maybe(() => faker.lorem.sentences({ min: 1, max: 3 }), {
          probability: 0.65,
        }) ?? null,
      createdAt: board.createdAt,
      updatedAt: board.updatedAt,
    };
  });

  const listings = Array.from({ length: config.listings }, () => {
    const market = faker.helpers.arrayElement(MARKETS);
    const neighborhood = faker.helpers.arrayElement(market.neighborhoods);
    const bedrooms = faker.helpers.arrayElement([0, 0, 1, 1, 1, 2, 2, 3]);
    const createdAt = faker.date.recent({ days: 120 });
    const price = faker.number.int({ min: 1450, max: 6500 });
    const squareFeet =
      faker.helpers.maybe(() => faker.number.int({ min: 350, max: 1600 }), {
        probability: 0.82,
      }) ?? null;

    return {
      id: faker.string.uuid(),
      source: faker.helpers.arrayElement(["manual", "pasted_link", "pasted_text", "api"]),
      sourceName: faker.helpers.arrayElement([
        "Manual Entry",
        "User Pasted Link",
        "User Pasted Text",
        "Future Provider Placeholder",
      ]),
      sourceUrl:
        faker.helpers.maybe(
          () => `https://example-listings.local/${faker.string.alphanumeric(12).toLowerCase()}`,
          { probability: 0.5 },
        ) ?? null,
      externalId: faker.helpers.maybe(() => faker.string.alphanumeric(16), { probability: 0.4 }) ?? null,
      address: faker.location.streetAddress(),
      city: market.city,
      state: market.state,
      zip: faker.location.zipCode("#####"),
      neighborhood,
      price,
      bedrooms,
      bathrooms: faker.helpers.arrayElement([1, 1, 1.5, 2, 2.5]),
      squareFeet,
      availableDate: faker.date.soon({ days: 120 }).toISOString(),
      propertyType: faker.helpers.arrayElement(["apartment", "apartment", "condo", "house", "room"]),
      amenities: asJson(pickSome([...MUST_HAVES, ...NICE_TO_HAVES], 2, 6)),
      fees: asJson({
        brokerFee: faker.helpers.arrayElement([null, 0, price, Math.floor(price * 0.15)]),
        applicationFee: faker.helpers.arrayElement([null, 20, 50, 75, 100]),
        deposit: faker.helpers.arrayElement([null, price, Math.floor(price * 1.5)]),
        utilitiesIncluded: faker.helpers.arrayElement([
          null,
          ["heat", "hot water"],
          ["water"],
          ["heat", "gas", "water"],
        ]),
      }),
      description: faker.lorem.paragraphs({ min: 2, max: 4 }),
      images: asJson(
        Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () =>
          `https://picsum.photos/seed/${faker.string.alphanumeric(10)}/800/600`,
        ),
      ),
      status: faker.helpers.arrayElement(["active", "active", "unknown", "saved_only", "rented"]),
      createdAt: createdAt.toISOString(),
      updatedAt: faker.date.between({ from: createdAt, to: new Date() }).toISOString(),
    };
  });

  const listingById = new Map(listings.map((listing) => [listing.id, listing]));
  const boardListings: Array<Record<string, unknown>> = [];

  for (const board of boards) {
    const count = faker.number.int({
      min: config.minListingsPerBoard,
      max: config.maxListingsPerBoard,
    });

    for (const listingId of faker.helpers.arrayElements(listings.map((listing) => listing.id), count)) {
      const listing = listingById.get(listingId);
      if (!listing) {
        continue;
      }

      boardListings.push({
        id: faker.string.uuid(),
        boardId: board.id,
        listingId,
        userStatus: faker.helpers.arrayElement(["new", "interested", "maybe", "rejected", "toured", "applied"]),
        userNotes:
          faker.helpers.maybe(() => faker.lorem.sentences({ min: 1, max: 2 }), {
            probability: 0.6,
          }) ?? null,
        aiSummary: buildSummary(
          String(listing.city ?? "Unknown city"),
          String(listing.neighborhood ?? "Unknown area"),
          Number(listing.price ?? 0),
        ),
        aiTradeoffAnalysis: buildAnalysis(
          String(listing.neighborhood ?? "this area"),
          Number(listing.price ?? 0),
          (listing.squareFeet as number | null) ?? null,
        ),
        aiRedFlags: asJson(buildRedFlags()),
        questionsToAsk: asJson(buildQuestions()),
        createdAt: faker.date.between({ from: new Date(board.createdAt), to: new Date(board.updatedAt) }).toISOString(),
        updatedAt: faker.date.between({ from: new Date(board.createdAt), to: new Date() }).toISOString(),
      });
    }
  }

  const priceHistoryEntries = listings.flatMap((listing) => {
    const historyCount = faker.number.int({ min: 1, max: config.maxPriceHistoryEntries });
    const prices: number[] = [];

    let currentPrice = listing.price ?? 2000;
    for (let index = 0; index < historyCount; index += 1) {
      currentPrice += faker.number.int({ min: -125, max: 150 });
      prices.push(Math.max(1200, currentPrice));
    }

    return prices.map((price) => ({
      id: faker.string.uuid(),
      listingId: listing.id,
      price,
      observedAt: faker.date.recent({ days: 150 }).toISOString(),
      source: faker.helpers.arrayElement(["manual", "user_update", "api"]),
    }));
  });

  const chatMessages = boards.flatMap((board, index) => {
    const profile = profiles[index];
    const locations = profile.locations ? (JSON.parse(profile.locations) as string[]) : ["Jersey City"];
    const starterConversation = generateConversation(profile.moveInTimeframe ?? "soon", locations);
    const totalMessages = Math.max(config.chatMessagesPerBoard, starterConversation.length * 2);
    const messages: Array<Record<string, unknown>> = [];

    let messageTime = faker.date.between({ from: new Date(board.createdAt), to: new Date(board.updatedAt) });
    for (let messageIndex = 0; messageIndex < totalMessages; messageIndex += 1) {
      const role = messageIndex % 2 === 0 ? "user" : "assistant";
      const baseLine =
        starterConversation[messageIndex % starterConversation.length] ?? faker.lorem.sentence();

      messages.push({
        id: faker.string.uuid(),
        boardId: board.id,
        role,
        content:
          role === "user"
            ? baseLine
            : `I’m updating your search profile based on that. ${faker.helpers.arrayElement([
                "What matters most right now: price, space, commute, neighborhood, or amenities?",
                "I can work with that. Do you want me to stay flexible on neighborhoods?",
                "That helps. If you add a few listings, I can start comparing tradeoffs for you.",
              ])}`,
        createdAt: messageTime.toISOString(),
      });

      messageTime = faker.date.soon({ days: 3, refDate: messageTime });
    }

    return messages;
  });

  const roommateProfiles = boards.flatMap((board, index) => {
    const profile = profiles[index];
    const preferredNeighborhoods = profile.locations ? (JSON.parse(profile.locations) as string[]) : [];
    const groupBudget = profile.budgetMax ?? null;
    const roommateCount = faker.number.int({ min: 2, max: 4 });

    return Array.from({ length: roommateCount }, () => ({
      id: faker.string.uuid(),
      boardId: board.id,
      name: faker.person.firstName(),
      roleLabel: faker.helpers.arrayElement(ROOMMATE_ROLES),
      budgetMax:
        groupBudget === null
          ? faker.number.int({ min: 1600, max: 3600 })
          : Math.max(1200, groupBudget + faker.number.int({ min: -500, max: 350 })),
      commuteDestination: faker.helpers.arrayElement(COMMUTE_TARGETS),
      commutePriority: pickOne(PRIORITY_LEVELS),
      neighborhoodPriority: pickOne(PRIORITY_LEVELS),
      spacePriority: pickOne(PRIORITY_LEVELS),
      privacyPriority: pickOne(PRIORITY_LEVELS),
      preferredNeighborhoods: asJson(faker.helpers.arrayElements(preferredNeighborhoods, { min: 1, max: Math.max(1, preferredNeighborhoods.length) })),
      mustHaves: asJson(pickSome(MUST_HAVES, 1, 2)),
      dealbreakers: asJson(pickSome(DEALBREAKERS, 1, 2)),
      notes:
        faker.helpers.maybe(() => faker.lorem.sentences({ min: 1, max: 2 }), {
          probability: 0.55,
        }) ?? null,
      createdAt: board.createdAt,
      updatedAt: board.updatedAt,
    }));
  });

  const roommatesByBoardId = new Map<string, typeof roommateProfiles>();
  for (const roommate of roommateProfiles) {
    const existing = roommatesByBoardId.get(roommate.boardId) ?? [];
    existing.push(roommate);
    roommatesByBoardId.set(roommate.boardId, existing);
  }

  const boardListingVotes = boardListings.flatMap((boardListing) => {
    const roommates = roommatesByBoardId.get(String(boardListing.boardId)) ?? [];
    return faker.helpers.arrayElements(roommates, {
      min: 1,
      max: Math.max(1, Math.min(roommates.length, 3)),
    }).map((roommate) => ({
      id: faker.string.uuid(),
      boardListingId: String(boardListing.id),
      roommateId: roommate.id,
      vote: faker.helpers.arrayElement(VOTE_TYPES),
      note:
        faker.helpers.maybe(() => faker.lorem.sentence(), {
          probability: 0.45,
        }) ?? null,
      createdAt: faker.date.recent({ days: 25 }).toISOString(),
    }));
  });

  const boardListingComments = boardListings.flatMap((boardListing) => {
    const roommates = roommatesByBoardId.get(String(boardListing.boardId)) ?? [];
    const commentCount = faker.number.int({ min: 0, max: Math.min(3, roommates.length) });
    return faker.helpers.arrayElements(roommates, {
      min: commentCount,
      max: commentCount,
    }).map((roommate) => ({
      id: faker.string.uuid(),
      boardListingId: String(boardListing.id),
      roommateId: roommate.id,
      content: faker.helpers.arrayElement([
        "I could actually see us living here if the fees are not insane.",
        "Neighborhood feels like the main reason to keep this alive.",
        "Commute looks okay, but I am nervous about the space.",
        "This feels too expensive unless the building quality is obviously better.",
        "Would want to know laundry and broker fee details before getting attached.",
      ]),
      createdAt: faker.date.recent({ days: 20 }).toISOString(),
    }));
  });

  const boardEvents = boards.flatMap((board) => {
    const roommates = roommatesByBoardId.get(board.id) ?? [];
    const events: Array<Record<string, unknown>> = [];

    for (const roommate of roommates) {
      events.push({
        id: faker.string.uuid(),
        boardId: board.id,
        actorType: "roommate",
        actorName: roommate.name,
        eventType: "joined_board",
        content: `${roommate.name} joined the board as the ${roommate.roleLabel}.`,
        createdAt: faker.date.recent({ days: 18 }).toISOString(),
      });
    }

    events.push({
      id: faker.string.uuid(),
      boardId: board.id,
      actorType: "assistant",
      actorName: "Advisor",
      eventType: "group_synthesis",
      content: faker.helpers.arrayElement([
        "Pulled the board toward commute-friendly neighborhoods that still keep some neighborhood energy in play.",
        "Flagged a likely tension between budget ceilings and the group’s nicer-neighborhood preferences.",
        "Found a compromise pattern: one roommate skews commute, another skews neighborhood, so the center of gravity is in the middle.",
      ]),
      createdAt: faker.date.recent({ days: 12 }).toISOString(),
    });

    return events;
  });

  const insertUsers = db.prepare("INSERT INTO users (id, createdAt) VALUES (@id, @createdAt)");
  const insertBoards = db.prepare(
    "INSERT INTO searchBoards (id, userId, title, createdAt, updatedAt) VALUES (@id, @userId, @title, @createdAt, @updatedAt)",
  );
  const insertProfiles = db.prepare(`
    INSERT INTO searchProfiles (
      id, boardId, intent, propertyType, locations, budgetMin, budgetMax, bedroomsPreferred,
      bedroomsFlexible, moveInTimeframe, mustHaves, niceToHaves, dealbreakers, priorities,
      petsRequired, parkingRequired, laundryRequired, commuteTarget, notes, createdAt, updatedAt
    ) VALUES (
      @id, @boardId, @intent, @propertyType, @locations, @budgetMin, @budgetMax, @bedroomsPreferred,
      @bedroomsFlexible, @moveInTimeframe, @mustHaves, @niceToHaves, @dealbreakers, @priorities,
      @petsRequired, @parkingRequired, @laundryRequired, @commuteTarget, @notes, @createdAt, @updatedAt
    )
  `);
  const insertListings = db.prepare(`
    INSERT INTO listings (
      id, source, sourceName, sourceUrl, externalId, address, city, state, zip, neighborhood, price,
      bedrooms, bathrooms, squareFeet, availableDate, propertyType, amenities, fees, description,
      images, status, createdAt, updatedAt
    ) VALUES (
      @id, @source, @sourceName, @sourceUrl, @externalId, @address, @city, @state, @zip, @neighborhood, @price,
      @bedrooms, @bathrooms, @squareFeet, @availableDate, @propertyType, @amenities, @fees, @description,
      @images, @status, @createdAt, @updatedAt
    )
  `);
  const insertBoardListings = db.prepare(`
    INSERT INTO boardListings (
      id, boardId, listingId, userStatus, userNotes, aiSummary, aiTradeoffAnalysis, aiRedFlags,
      questionsToAsk, createdAt, updatedAt
    ) VALUES (
      @id, @boardId, @listingId, @userStatus, @userNotes, @aiSummary, @aiTradeoffAnalysis, @aiRedFlags,
      @questionsToAsk, @createdAt, @updatedAt
    )
  `);
  const insertPriceHistory = db.prepare(
    "INSERT INTO priceHistory (id, listingId, price, observedAt, source) VALUES (@id, @listingId, @price, @observedAt, @source)",
  );
  const insertChatMessages = db.prepare(
    "INSERT INTO chatMessages (id, boardId, role, content, createdAt) VALUES (@id, @boardId, @role, @content, @createdAt)",
  );
  const insertRoommateProfiles = db.prepare(`
    INSERT INTO roommateProfiles (
      id, boardId, name, roleLabel, budgetMax, commuteDestination, commutePriority, neighborhoodPriority,
      spacePriority, privacyPriority, preferredNeighborhoods, mustHaves, dealbreakers, notes, createdAt, updatedAt
    ) VALUES (
      @id, @boardId, @name, @roleLabel, @budgetMax, @commuteDestination, @commutePriority, @neighborhoodPriority,
      @spacePriority, @privacyPriority, @preferredNeighborhoods, @mustHaves, @dealbreakers, @notes, @createdAt, @updatedAt
    )
  `);
  const insertBoardListingVotes = db.prepare(
    "INSERT INTO boardListingVotes (id, boardListingId, roommateId, vote, note, createdAt) VALUES (@id, @boardListingId, @roommateId, @vote, @note, @createdAt)",
  );
  const insertBoardListingComments = db.prepare(
    "INSERT INTO boardListingComments (id, boardListingId, roommateId, content, createdAt) VALUES (@id, @boardListingId, @roommateId, @content, @createdAt)",
  );
  const insertBoardEvents = db.prepare(
    "INSERT INTO boardEvents (id, boardId, actorType, actorName, eventType, content, createdAt) VALUES (@id, @boardId, @actorType, @actorName, @eventType, @content, @createdAt)",
  );

  const seedTransaction = db.transaction(() => {
    for (const row of users) insertUsers.run(row);
    for (const row of boards) insertBoards.run(row);
    for (const row of profiles) insertProfiles.run(row);
    for (const row of listings) insertListings.run(row);
    for (const row of boardListings) insertBoardListings.run(row);
    for (const row of priceHistoryEntries) insertPriceHistory.run(row);
    for (const row of chatMessages) insertChatMessages.run(row);
    for (const row of roommateProfiles) insertRoommateProfiles.run(row);
    for (const row of boardListingVotes) insertBoardListingVotes.run(row);
    for (const row of boardListingComments) insertBoardListingComments.run(row);
    for (const row of boardEvents) insertBoardEvents.run(row);
  });

  seedTransaction();
  db.close();

  console.log("Dummy data generation complete.");
  console.log(
    JSON.stringify(
      {
        database: config.dbPath,
        users: users.length,
        boards: boards.length,
        profiles: profiles.length,
        listings: listings.length,
        boardListings: boardListings.length,
        priceHistory: priceHistoryEntries.length,
        chatMessages: chatMessages.length,
        roommateProfiles: roommateProfiles.length,
        boardListingVotes: boardListingVotes.length,
        boardListingComments: boardListingComments.length,
        boardEvents: boardEvents.length,
        scale: config,
      },
      null,
      2,
    ),
  );
}

main();
