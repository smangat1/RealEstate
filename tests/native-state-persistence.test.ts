import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  "ios/HomeboardNative/HomeboardNative/Sources/AppModel.swift",
  "utf8",
);

test("native state is stored in five independently versioned records", () => {
  assert.match(source, /VersionedPersistenceRecord<Payload: Codable>/);
  assert.match(source, /var schemaVersion: Int/);
  for (const key of [
    "homeboard.native.account-session",
    "homeboard.native.profile",
    "homeboard.native.boards-listings",
    "homeboard.native.onboarding",
    "homeboard.native.pending-operations",
  ]) {
    assert.match(source, new RegExp(key.replaceAll(".", "\\.")));
  }
  assert.match(source, /writePersistenceRecord\(accountSession,/);
  assert.match(source, /writePersistenceRecord\(profileRecord,/);
  assert.match(source, /writePersistenceRecord\(boardsListings,/);
  assert.match(source, /writePersistenceRecord\(onboarding,/);
  assert.match(source, /writePersistenceRecord\(pendingOperations,/);
});

test("legacy snapshots migrate only after every destination record is durable", () => {
  assert.match(source, /LegacyPersistedState/);
  assert.match(source, /legacyPersistenceKey = "homeboard\.native\.state"/);
  assert.match(source, /let migrationCompleted = persistenceKeys\.allSatisfy/);
  assert.match(
    source,
    /if migrationCompleted \{\s*defaults\.removeObject\(forKey: legacyPersistenceKey\)/,
  );
});

test("an unreadable record is preserved instead of being overwritten by defaults", () => {
  assert.match(source, /unreadablePersistenceKeys\.insert\(key\)/);
  assert.match(
    source,
    /guard !unreadablePersistenceKeys\.contains\(key\) else \{ return \}/,
  );
  assert.match(source, /Preserve undecodable Keychain bytes/);
  assert.match(source, /if let authSession \{\s*NativeAuthSessionStore\.save\(authSession\)/);
});

test("Keychain sessions use a stable service and upgrade their old encoding", () => {
  assert.match(source, /private static let service = "com\.homeboard\.native"/);
  assert.match(source, /StoredSessionRecord/);
  assert.match(source, /JSONDecoder\(\)\.decode\(NativeAuthSession\.self, from: data\)/);
  assert.match(source, /save\(legacySession\)/);
});
