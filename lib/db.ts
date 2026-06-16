import path from "node:path";
import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";

import { buildStarterListings } from "@/lib/starter-listings";

const globalForDb = globalThis as unknown as {
  rentalAdvisorDb?: Database.Database;
};

function hasColumn(db: Database.Database, table: string, column: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function ensureColumn(db: Database.Database, table: string, column: string, definition: string) {
  if (!hasColumn(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function ensureBaseSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      displayName TEXT,
      workAddress TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT
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
      authorUserId TEXT,
      authorName TEXT,
      content TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (boardId) REFERENCES searchBoards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS roommateProfiles (
      id TEXT PRIMARY KEY,
      boardId TEXT NOT NULL,
      linkedUserId TEXT,
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
      FOREIGN KEY (boardId) REFERENCES searchBoards(id) ON DELETE CASCADE,
      FOREIGN KEY (linkedUserId) REFERENCES users(id) ON DELETE SET NULL
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
    CREATE INDEX IF NOT EXISTS idx_listings_city_neighborhood ON listings(city, neighborhood);
    CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(price);
    CREATE INDEX IF NOT EXISTS idx_boardListings_boardId_status ON boardListings(boardId, userStatus);
    CREATE INDEX IF NOT EXISTS idx_priceHistory_listingId_observedAt ON priceHistory(listingId, observedAt);
    CREATE INDEX IF NOT EXISTS idx_chatMessages_boardId_createdAt ON chatMessages(boardId, createdAt);
    CREATE INDEX IF NOT EXISTS idx_roommateProfiles_boardId ON roommateProfiles(boardId);
    CREATE INDEX IF NOT EXISTS idx_roommateProfiles_linkedUserId ON roommateProfiles(linkedUserId);
    CREATE INDEX IF NOT EXISTS idx_boardListingVotes_boardListingId ON boardListingVotes(boardListingId);
    CREATE INDEX IF NOT EXISTS idx_boardListingComments_boardListingId ON boardListingComments(boardListingId, createdAt);
    CREATE INDEX IF NOT EXISTS idx_boardEvents_boardId_createdAt ON boardEvents(boardId, createdAt);
  `);
}

function ensureCompatibleColumns(db: Database.Database) {
  ensureColumn(db, "users", "displayName", "TEXT");
  ensureColumn(db, "users", "workAddress", "TEXT");
  ensureColumn(db, "users", "updatedAt", "TEXT");
  ensureColumn(db, "chatMessages", "authorUserId", "TEXT");
  ensureColumn(db, "chatMessages", "authorName", "TEXT");
  ensureColumn(db, "roommateProfiles", "linkedUserId", "TEXT");

  db.exec(`
    UPDATE users
    SET displayName = COALESCE(displayName, 'Local user'),
        updatedAt = COALESCE(updatedAt, createdAt);

    UPDATE chatMessages
    SET authorName = COALESCE(
      authorName,
      CASE
        WHEN role = 'assistant' THEN 'Advisor'
        WHEN role = 'system' THEN 'System'
        ELSE 'Unknown user'
      END
    );
  `);
}

function ensureStarterListings(db: Database.Database) {
  const row = db.prepare("SELECT COUNT(*) as count FROM listings").get() as { count: number };
  if (row.count > 0) return;

  const insert = db.prepare(`
    INSERT INTO listings (
      id, source, sourceName, sourceUrl, externalId, address, city, state, zip, neighborhood, price,
      bedrooms, bathrooms, squareFeet, availableDate, propertyType, amenities, fees, description,
      images, status, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();
  const seeds = buildStarterListings();
  const transaction = db.transaction(() => {
    for (const seed of seeds) {
      insert.run(
        randomUUID(),
        seed.source,
        seed.sourceName,
        null,
        null,
        seed.address,
        seed.city,
        seed.state,
        null,
        seed.neighborhood,
        seed.price,
        seed.bedrooms,
        seed.bathrooms,
        seed.squareFeet,
        null,
        seed.propertyType,
        JSON.stringify(seed.amenities),
        JSON.stringify({
          brokerFee: null,
          applicationFee: 50,
          deposit: Math.round(seed.price * 0.75),
          utilitiesIncluded: null,
        }),
        seed.description,
        JSON.stringify([]),
        seed.status,
        now,
        now,
      );
    }
  });

  transaction();
}

function openDatabase() {
  const dbPath = path.resolve(process.cwd(), "data", "rental-advisor.db");
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  ensureBaseSchema(db);
  ensureCompatibleColumns(db);
  ensureStarterListings(db);
  return db;
}

export function getDb() {
  if (!globalForDb.rentalAdvisorDb) {
    globalForDb.rentalAdvisorDb = openDatabase();
  }

  return globalForDb.rentalAdvisorDb;
}
