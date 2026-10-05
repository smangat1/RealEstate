import Foundation
import Security

struct AdvisorSensitiveFinance: Codable, Equatable {
  var disclosureMode: String
  var annualIncomeMin: Int?
  var annualIncomeMax: Int?
  var creditScoreMin: Int?
  var creditScoreMax: Int?
  var legacyIncomeMultiple: String?
  var promptCompletedAt: String?
  var serverCleanupPending: Bool

  init(
    disclosureMode: String = "available_on_request",
    annualIncomeMin: Int? = nil,
    annualIncomeMax: Int? = nil,
    creditScoreMin: Int? = nil,
    creditScoreMax: Int? = nil,
    legacyIncomeMultiple: String? = nil,
    promptCompletedAt: String? = nil,
    serverCleanupPending: Bool = false
  ) {
    self.disclosureMode = disclosureMode
    self.annualIncomeMin = annualIncomeMin
    self.annualIncomeMax = annualIncomeMax
    self.creditScoreMin = creditScoreMin
    self.creditScoreMax = creditScoreMax
    self.legacyIncomeMultiple = legacyIncomeMultiple
    self.promptCompletedAt = promptCompletedAt
    self.serverCleanupPending = serverCleanupPending
  }
}

enum AdvisorSensitiveKeychainRead {
  case missing
  case data(Data)
  case failed
}

protocol AdvisorSensitiveKeychainClient {
  func read(account: String) -> AdvisorSensitiveKeychainRead
  func write(_ data: Data, account: String) -> Bool
  func delete(account: String)
}

final class AdvisorSensitiveStore {
  private struct Envelope: Codable {
    var schemaVersion: Int
    var boards: [String: AdvisorSensitiveFinance]
  }

  static let shared = AdvisorSensitiveStore(client: SystemAdvisorSensitiveKeychainClient())
  static let schemaVersion = 1

  private let client: AdvisorSensitiveKeychainClient

  init(client: AdvisorSensitiveKeychainClient) {
    self.client = client
  }

  func load(userId: String, boardId: String) -> AdvisorSensitiveFinance? {
    guard case .data(let data) = client.read(account: account(for: userId)),
          let envelope = decode(data) else { return nil }
    return envelope.boards[boardId]
  }

  @discardableResult
  func save(_ finance: AdvisorSensitiveFinance, userId: String, boardId: String) -> Bool {
    let envelope: Envelope
    switch client.read(account: account(for: userId)) {
    case .missing:
      envelope = Envelope(schemaVersion: Self.schemaVersion, boards: [:])
    case .data(let data):
      guard let decoded = decode(data) else {
        // Never overwrite undecodable Keychain bytes with an apparently empty
        // record. A support build may still be able to recover them.
        return false
      }
      envelope = decoded
    case .failed:
      // A transient Keychain read failure is not proof that no data exists.
      return false
    }

    var updated = envelope
    updated.boards[boardId] = finance
    guard let data = try? JSONEncoder().encode(updated) else { return false }
    return client.write(data, account: account(for: userId))
  }

  func delete(userId: String) {
    client.delete(account: account(for: userId))
  }

  private func decode(_ data: Data) -> Envelope? {
    guard let envelope = try? JSONDecoder().decode(Envelope.self, from: data),
          envelope.schemaVersion == Self.schemaVersion else { return nil }
    return envelope
  }

  private func account(for userId: String) -> String {
    "advisor.finance.\(userId)"
  }
}

private struct SystemAdvisorSensitiveKeychainClient: AdvisorSensitiveKeychainClient {
  // Separate from the login session namespace. Finance is used only while the
  // foreground UI is unlocked, so the stricter WhenUnlockedThisDeviceOnly
  // class is sufficient and prevents migration through backups/iCloud.
  private let service = "com.homeboard.native.advisor-sensitive"

  func read(account: String) -> AdvisorSensitiveKeychainRead {
    var result: CFTypeRef?
    let status = SecItemCopyMatching(
      [
        kSecClass: kSecClassGenericPassword,
        kSecAttrService: service,
        kSecAttrAccount: account,
        kSecReturnData: true,
        kSecMatchLimit: kSecMatchLimitOne,
      ] as CFDictionary,
      &result
    )
    if status == errSecItemNotFound { return .missing }
    guard status == errSecSuccess, let data = result as? Data else { return .failed }
    return .data(data)
  }

  func write(_ data: Data, account: String) -> Bool {
    let lookup = [
      kSecClass: kSecClassGenericPassword,
      kSecAttrService: service,
      kSecAttrAccount: account,
    ] as CFDictionary
    let update = [kSecValueData: data] as CFDictionary
    let updateStatus = SecItemUpdate(lookup, update)
    if updateStatus == errSecSuccess { return true }
    guard updateStatus == errSecItemNotFound else { return false }
    return SecItemAdd(
      [
        kSecClass: kSecClassGenericPassword,
        kSecAttrService: service,
        kSecAttrAccount: account,
        kSecValueData: data,
        kSecAttrAccessible: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
      ] as CFDictionary,
      nil
    ) == errSecSuccess
  }

  func delete(account: String) {
    SecItemDelete(
      [
        kSecClass: kSecClassGenericPassword,
        kSecAttrService: service,
        kSecAttrAccount: account,
      ] as CFDictionary
    )
  }
}
