import XCTest
@testable import HomeboardNative

final class KeychainSensitiveStoreTests: XCTestCase {
  private let appPersistenceKeys = [
    "homeboard.native.state",
    "homeboard.native.account-session",
    "homeboard.native.profile",
    "homeboard.native.boards-listings",
    "homeboard.native.onboarding",
    "homeboard.native.pending-operations",
  ]

  override func setUp() {
    super.setUp()
    appPersistenceKeys.forEach(UserDefaults.standard.removeObject)
  }

  override func tearDown() {
    appPersistenceKeys.forEach(UserDefaults.standard.removeObject)
    SensitiveStoreURLProtocol.response = nil
    super.tearDown()
  }

  func testStoresSeparateBoardsInOneUserScopedVersionedRecord() {
    let keychain = FakeAdvisorSensitiveKeychain()
    let store = AdvisorSensitiveStore(client: keychain)
    let first = AdvisorSensitiveFinance(
      disclosureMode: "omit",
      annualIncomeMin: 80_000,
      annualIncomeMax: 95_000,
      creditScoreMin: 720,
      creditScoreMax: 760,
      promptCompletedAt: "2026-10-04T20:00:00Z"
    )
    let second = AdvisorSensitiveFinance(disclosureMode: "available_on_request")

    XCTAssertTrue(store.save(first, userId: "user-a", boardId: "board-a"))
    XCTAssertTrue(store.save(second, userId: "user-a", boardId: "board-b"))
    XCTAssertEqual(store.load(userId: "user-a", boardId: "board-a"), first)
    XCTAssertEqual(store.load(userId: "user-a", boardId: "board-b"), second)
    XCTAssertNil(store.load(userId: "user-b", boardId: "board-a"))
  }

  func testCorruptOrFailedReadNeverOverwritesExistingBytes() {
    let keychain = FakeAdvisorSensitiveKeychain()
    keychain.values["advisor.finance.user-a"] = Data("not-json".utf8)
    let store = AdvisorSensitiveStore(client: keychain)

    XCTAssertFalse(store.save(.init(), userId: "user-a", boardId: "board-a"))
    XCTAssertEqual(keychain.values["advisor.finance.user-a"], Data("not-json".utf8))
    XCTAssertEqual(keychain.writeCount, 0)

    keychain.readFails = true
    XCTAssertFalse(store.save(.init(), userId: "user-b", boardId: "board-b"))
    XCTAssertEqual(keychain.writeCount, 0)
  }

  func testWriteFailureKeepsPriorRecordAndDeleteIsUserScoped() {
    let keychain = FakeAdvisorSensitiveKeychain()
    let store = AdvisorSensitiveStore(client: keychain)
    let original = AdvisorSensitiveFinance(creditScoreMin: 710, creditScoreMax: 750)
    XCTAssertTrue(store.save(original, userId: "user-a", boardId: "board-a"))
    XCTAssertTrue(store.save(.init(), userId: "user-b", boardId: "board-a"))

    keychain.writeFails = true
    XCTAssertFalse(store.save(.init(creditScoreMin: 800), userId: "user-a", boardId: "board-a"))
    XCTAssertEqual(store.load(userId: "user-a", boardId: "board-a"), original)

    store.delete(userId: "user-a")
    XCTAssertNil(store.load(userId: "user-a", boardId: "board-a"))
    XCTAssertNotNil(store.load(userId: "user-b", boardId: "board-a"))
  }

  @MainActor
  func testLegacyProfileMigrationKeepsOriginalBytesUntilKeychainWriteSucceeds() throws {
    var legacy = RentalProfile()
    legacy.advisorFinancialMode = "omit"
    legacy.advisorIncomeMultiple = "4x"
    legacy.advisorCreditScore = "755"
    let originalProfileRecord = try installLegacyProfileRecord(legacy, userId: "migration-user")

    let failingKeychain = FakeAdvisorSensitiveKeychain()
    failingKeychain.writeFails = true
    let failingModel = AppModel(
      api: HomeboardAPI(),
      advisorOutcomeMemory: AdvisorOutcomeMemory(
        defaults: UserDefaults(suiteName: "sensitive-migration-fail-\(UUID().uuidString)")!,
        key: "memory"
      ),
      advisorSensitiveStore: AdvisorSensitiveStore(client: failingKeychain)
    )
    failingModel.migrateLegacyAdvisorSensitiveProfileIfNeeded(for: "migration-user")
    XCTAssertEqual(
      UserDefaults.standard.data(forKey: "homeboard.native.profile"),
      originalProfileRecord,
      "A failed Keychain write must not replace the only recoverable legacy copy"
    )

    let workingKeychain = FakeAdvisorSensitiveKeychain()
    let workingModel = AppModel(
      api: HomeboardAPI(),
      advisorOutcomeMemory: AdvisorOutcomeMemory(
        defaults: UserDefaults(suiteName: "sensitive-migration-pass-\(UUID().uuidString)")!,
        key: "memory"
      ),
      advisorSensitiveStore: AdvisorSensitiveStore(client: workingKeychain)
    )
    workingModel.migrateLegacyAdvisorSensitiveProfileIfNeeded(for: "migration-user")
    let migrated = AdvisorSensitiveStore(client: workingKeychain).load(
      userId: "migration-user",
      boardId: "draft-new homeboard"
    )
    XCTAssertEqual(migrated?.disclosureMode, "omit")
    XCTAssertEqual(migrated?.legacyIncomeMultiple, "4x")
    XCTAssertEqual(migrated?.creditScoreMin, 755)
    XCTAssertEqual(migrated?.creditScoreMax, 755)
    let rewritten = try XCTUnwrap(UserDefaults.standard.data(forKey: "homeboard.native.profile"))
    let rewrittenText = String(decoding: rewritten, as: UTF8.self)
    XCTAssertFalse(rewrittenText.contains("advisorFinancialMode"))
    XCTAssertFalse(rewrittenText.contains("advisorIncomeMultiple"))
    XCTAssertFalse(rewrittenText.contains("advisorCreditScore"))
    XCTAssertFalse(rewrittenText.contains("4x"))
    XCTAssertFalse(rewrittenText.contains("755"))
  }

  @MainActor
  func testProfileAndBoardProfileRequestExcludeSensitiveKeys() async throws {
    var profile = RentalProfile()
    profile.name = "Sam"
    profile.advisorFinancialMode = "provided"
    profile.advisorIncomeMultiple = "3.5x"
    profile.advisorCreditScore = "760"

    let localData = try JSONEncoder().encode(AppModel.profileForLocalPersistence(profile))
    let localJSON = String(decoding: localData, as: UTF8.self)
    XCTAssertFalse(localJSON.contains("advisorFinancialMode"))
    XCTAssertFalse(localJSON.contains("advisorIncomeMultiple"))
    XCTAssertFalse(localJSON.contains("advisorCreditScore"))
    XCTAssertFalse(localJSON.contains("3.5x"))
    XCTAssertFalse(localJSON.contains("760"))

    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [SensitiveStoreURLProtocol.self]
    SensitiveStoreURLProtocol.response = { request in
      let body = try SensitiveStoreURLProtocol.bodyData(for: request)
      let json = try XCTUnwrap(
        JSONSerialization.jsonObject(with: body) as? [String: Any]
      )
      let encodedProfile = try XCTUnwrap(json["profile"] as? [String: Any])
      XCTAssertNil(encodedProfile["advisorFinancialMode"])
      XCTAssertNil(encodedProfile["advisorIncomeMultiple"])
      XCTAssertNil(encodedProfile["advisorCreditScore"])
      XCTAssertFalse(String(decoding: body, as: UTF8.self).contains("3.5x"))
      XCTAssertFalse(String(decoding: body, as: UTF8.self).contains("760"))
      return .init(status: 500, body: #"{"error":"inspection complete"}"#)
    }
    let api = HomeboardAPI(session: URLSession(configuration: configuration))
    do {
      _ = try await api.saveBoardProfile(
        accessToken: "test-token",
        boardId: "board-a",
        profile: profile
      )
      XCTFail("Inspection response should fail after request capture")
    } catch {
      // Expected: the request body was inspected before the deliberate 500.
    }
  }

  @MainActor
  func testExistingServerFinanceMigratesLocallyThenClearsAmounts() async throws {
    let keychain = FakeAdvisorSensitiveKeychain()
    let store = AdvisorSensitiveStore(client: keychain)
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [SensitiveStoreURLProtocol.self]
    var requests: [URLRequest] = []
    SensitiveStoreURLProtocol.response = { request in
      requests.append(request)
      if request.httpMethod == "GET" {
        return .init(status: 200, body: Self.financeJSON(
          incomeMin: 90_000,
          incomeMax: 110_000,
          creditMin: 730,
          creditMax: 780,
          completedAt: "2026-10-04T20:00:00Z"
        ))
      }
      let object = try XCTUnwrap(
        JSONSerialization.jsonObject(with: try SensitiveStoreURLProtocol.bodyData(for: request)) as? [String: Any]
      )
      XCTAssertNil(object["annualIncomeMin"])
      XCTAssertNil(object["annualIncomeMax"])
      XCTAssertNil(object["creditScoreMin"])
      XCTAssertNil(object["creditScoreMax"])
      XCTAssertEqual(object["disclosureMode"] as? String, "available_on_request")
      return .init(status: 200, body: Self.financeJSON())
    }
    let model = AppModel(
      api: HomeboardAPI(session: URLSession(configuration: configuration)),
      advisorOutcomeMemory: AdvisorOutcomeMemory(
        defaults: UserDefaults(suiteName: "sensitive-memory-\(UUID().uuidString)")!,
        key: "memory"
      ),
      advisorSensitiveStore: store
    )
    model.authSession = NativeAuthSession(
      accessToken: "token-a", refreshToken: "refresh-a", userId: "user-a",
      email: "user-a@example.com", displayName: "User A"
    )
    model.board = .empty
    model.board.id = "board-a"

    let status = await model.refreshAdvisorFinancialStatus()
    XCTAssertEqual(status?.mine.annualIncomeMin, 90_000)
    XCTAssertEqual(status?.mine.creditScoreMax, 780)
    XCTAssertEqual(requests.map(\.httpMethod), ["GET", "PUT"])
    XCTAssertEqual(
      store.load(userId: "user-a", boardId: "board-a")?.serverCleanupPending,
      false
    )

    let updated = await model.updateAdvisorFinancialStatus(
      disclosureMode: "omit",
      annualIncomeMin: 95_000,
      annualIncomeMax: 120_000,
      creditScoreMin: 740,
      creditScoreMax: 790
    )
    XCTAssertEqual(updated?.mine.disclosureMode, "omit")
    XCTAssertEqual(updated?.mine.annualIncomeMax, 120_000)
    XCTAssertEqual(requests.count, 2, "New private values must never be sent back to the server")
  }

  @MainActor
  func testSignOutAndConfirmedAccountDeletionClearSensitiveStore() async {
    let keychain = FakeAdvisorSensitiveKeychain()
    let store = AdvisorSensitiveStore(client: keychain)
    XCTAssertTrue(store.save(.init(creditScoreMin: 720), userId: "user-a", boardId: "board-a"))
    let signOutModel = AppModel(
      api: HomeboardAPI(),
      advisorOutcomeMemory: AdvisorOutcomeMemory(
        defaults: UserDefaults(suiteName: "sensitive-signout-\(UUID().uuidString)")!,
        key: "memory"
      ),
      advisorSensitiveStore: store
    )
    signOutModel.authSession = NativeAuthSession(
      accessToken: "token-a", refreshToken: "refresh-a", userId: "user-a",
      email: "user-a@example.com", displayName: "User A"
    )
    signOutModel.signOut()
    XCTAssertNil(store.load(userId: "user-a", boardId: "board-a"))

    XCTAssertTrue(store.save(.init(creditScoreMin: 730), userId: "user-b", boardId: "board-b"))
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [SensitiveStoreURLProtocol.self]
    SensitiveStoreURLProtocol.response = { request in
      XCTAssertEqual(request.httpMethod, "DELETE")
      return .init(status: 200, body: #"{"ok":true}"#)
    }
    let deleteModel = AppModel(
      api: HomeboardAPI(session: URLSession(configuration: configuration)),
      advisorOutcomeMemory: AdvisorOutcomeMemory(
        defaults: UserDefaults(suiteName: "sensitive-delete-\(UUID().uuidString)")!,
        key: "memory"
      ),
      advisorSensitiveStore: store
    )
    deleteModel.authSession = NativeAuthSession(
      accessToken: "token-b", refreshToken: "refresh-b", userId: "user-b",
      email: "user-b@example.com", displayName: "User B"
    )
    deleteModel.deleteAccount()
    for _ in 0..<100 where store.load(userId: "user-b", boardId: "board-b") != nil {
      try? await Task.sleep(nanoseconds: 10_000_000)
    }
    XCTAssertNil(store.load(userId: "user-b", boardId: "board-b"))
  }

  private static func financeJSON(
    incomeMin: Int? = nil,
    incomeMax: Int? = nil,
    creditMin: Int? = nil,
    creditMax: Int? = nil,
    completedAt: String? = nil
  ) -> String {
    let value: (Int?) -> String = { $0.map(String.init) ?? "null" }
    let date = completedAt.map { "\"\($0)\"" } ?? "null"
    return """
    {"mine":{"annualIncomeMin":\(value(incomeMin)),"annualIncomeMax":\(value(incomeMax)),"creditScoreMin":\(value(creditMin)),"creditScoreMax":\(value(creditMax)),"disclosureMode":"available_on_request","promptCompletedAt":\(date)},"group":{"combinedAnnualIncomeMin":null,"combinedAnnualIncomeMax":null,"creditScoreMin":null,"creditScoreMax":null,"contributorCount":0,"memberCount":1}}
    """
  }

  private func installLegacyProfileRecord(_ profile: RentalProfile, userId: String) throws -> Data {
    let profileObject = try JSONSerialization.jsonObject(with: JSONEncoder().encode(profile))
    let profileRecord: [String: Any] = [
      "schemaVersion": 1,
      "payload": [
        "profile": profileObject,
        "localProfilesByBoard": [String: Any](),
      ],
    ]
    let profileData = try JSONSerialization.data(withJSONObject: profileRecord, options: [.sortedKeys])
    UserDefaults.standard.set(profileData, forKey: "homeboard.native.profile")

    let accountRecord: [String: Any] = [
      "schemaVersion": 1,
      "payload": [
        "currentScreen": "welcome",
        "authMode": "createAccount",
        "authenticatedAuthUserID": userId,
        "availableBoards": [Any](),
      ],
    ]
    UserDefaults.standard.set(
      try JSONSerialization.data(withJSONObject: accountRecord, options: [.sortedKeys]),
      forKey: "homeboard.native.account-session"
    )
    return profileData
  }
}

final class FakeAdvisorSensitiveKeychain: AdvisorSensitiveKeychainClient {
  var values: [String: Data] = [:]
  var readFails = false
  var writeFails = false
  var writeCount = 0

  func read(account: String) -> AdvisorSensitiveKeychainRead {
    if readFails { return .failed }
    return values[account].map(AdvisorSensitiveKeychainRead.data) ?? .missing
  }

  func write(_ data: Data, account: String) -> Bool {
    writeCount += 1
    guard !writeFails else { return false }
    values[account] = data
    return true
  }

  func delete(account: String) {
    values[account] = nil
  }
}

private final class SensitiveStoreURLProtocol: URLProtocol {
  struct StubResponse {
    var status: Int
    var body: String
  }

  static var response: ((URLRequest) throws -> StubResponse)?

  static func bodyData(for request: URLRequest) throws -> Data {
    if let body = request.httpBody { return body }
    guard let stream = request.httpBodyStream else { return Data() }
    stream.open()
    defer { stream.close() }
    var result = Data()
    var buffer = [UInt8](repeating: 0, count: 4_096)
    while true {
      let count = stream.read(&buffer, maxLength: buffer.count)
      if count < 0 { throw stream.streamError ?? URLError(.cannotDecodeContentData) }
      if count == 0 { break }
      result.append(buffer, count: count)
    }
    return result
  }

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    do {
      let stub = try Self.response?(request) ?? .init(status: 500, body: "{}")
      let response = HTTPURLResponse(
        url: request.url!,
        statusCode: stub.status,
        httpVersion: nil,
        headerFields: ["Content-Type": "application/json"]
      )!
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: Data(stub.body.utf8))
      client?.urlProtocolDidFinishLoading(self)
    } catch {
      client?.urlProtocol(self, didFailWithError: error)
    }
  }

  override func stopLoading() {}
}
