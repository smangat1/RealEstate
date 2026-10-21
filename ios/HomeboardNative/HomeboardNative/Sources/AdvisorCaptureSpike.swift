import AppIntents
import Foundation
import SwiftUI
import UserNotifications

struct AdvisorCaptureSpikeEntry: Codable, Identifiable, Sendable {
  let id: UUID
  let sender: String
  let body: String
  let capturedAt: Date
}

enum AdvisorCaptureSpikeStore {
  static let appGroup = "group.com.homeboard.native"

  // Replace these throwaway values with the broker numbers used for the device test.
  // Matching ignores punctuation, spaces, and a leading plus sign.
  static let testSenderHandles: Set<String> = [
    "12125550100",
    "16465550100",
  ]

  private static let entriesKey = "homeboard.advisor-capture-spike.entries-v1"
  private static let discardCountKey = "homeboard.advisor-capture-spike.discard-count-v1"
  private static let maximumEntryCount = 100
  private static let lock = NSLock()

  enum Outcome {
    case captured(AdvisorCaptureSpikeEntry)
    case discarded
    case storeUnavailable
  }

  @discardableResult
  static func record(sender: String, body: String, now: Date = Date()) -> Outcome {
    lock.lock()
    defer { lock.unlock() }

    guard let defaults = UserDefaults(suiteName: appGroup) else {
      return .storeUnavailable
    }

    guard testSenderHandles.contains(normalizedHandle(sender)) else {
      defaults.set(defaults.integer(forKey: discardCountKey) + 1, forKey: discardCountKey)
      defaults.synchronize()
      return .discarded
    }

    var captured = decodeEntries(from: defaults)
    let entry = AdvisorCaptureSpikeEntry(
      id: UUID(),
      sender: sender,
      body: body,
      capturedAt: now
    )
    captured.append(entry)
    captured = Array(captured.suffix(maximumEntryCount))

    guard let data = try? JSONEncoder().encode(captured) else {
      return .storeUnavailable
    }
    defaults.set(data, forKey: entriesKey)
    defaults.synchronize()
    return .captured(entry)
  }

  static func entries() -> [AdvisorCaptureSpikeEntry] {
    lock.lock()
    defer { lock.unlock() }
    guard let defaults = UserDefaults(suiteName: appGroup) else { return [] }
    return decodeEntries(from: defaults).sorted { $0.capturedAt > $1.capturedAt }
  }

  static func discardCount() -> Int {
    lock.lock()
    defer { lock.unlock() }
    return UserDefaults(suiteName: appGroup)?.integer(forKey: discardCountKey) ?? 0
  }

  static func clear() {
    lock.lock()
    defer { lock.unlock() }
    guard let defaults = UserDefaults(suiteName: appGroup) else { return }
    defaults.removeObject(forKey: entriesKey)
    defaults.removeObject(forKey: discardCountKey)
    defaults.synchronize()
  }

  private static func decodeEntries(from defaults: UserDefaults) -> [AdvisorCaptureSpikeEntry] {
    guard let data = defaults.data(forKey: entriesKey) else { return [] }
    return (try? JSONDecoder().decode([AdvisorCaptureSpikeEntry].self, from: data)) ?? []
  }

  private static func normalizedHandle(_ value: String) -> String {
    value.unicodeScalars
      .filter { CharacterSet.alphanumerics.contains($0) }
      .map(String.init)
      .joined()
      .lowercased()
  }
}

struct CaptureBrokerMessageIntent: AppIntent {
  static let title: LocalizedStringResource = "Capture Broker Message"
  static let description = IntentDescription(
    "Stores a test broker message in Homeboard for the Advisor capture spike."
  )
  static let openAppWhenRun = false

  @available(iOS 26.0, *)
  static var supportedModes: IntentModes { .background }

  @Parameter(title: "Sender")
  var sender: String

  @Parameter(title: "Body")
  var body: String

  func perform() async throws -> some IntentResult {
    let outcome = AdvisorCaptureSpikeStore.record(sender: sender, body: body)
    guard case let .captured(entry) = outcome else {
      return .result()
    }

    let content = UNMutableNotificationContent()
    content.title = "Homeboard captured a message"
    content.body = "\(entry.sender): \(String(entry.body.prefix(80)))"
    content.sound = .default

    let request = UNNotificationRequest(
      identifier: "advisor-capture-spike-\(entry.id.uuidString)",
      content: content,
      trigger: nil
    )
    try? await UNUserNotificationCenter.current().add(request)
    return .result()
  }
}

#if DEBUG
struct AdvisorCaptureSpikeDebugView: View {
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.dismiss) private var dismiss
  @State private var entries: [AdvisorCaptureSpikeEntry] = []
  @State private var discardCount = 0

  var body: some View {
    NavigationStack {
      List {
        Section("Filter") {
          Text("Accepted test handles: \(AdvisorCaptureSpikeStore.testSenderHandles.sorted().joined(separator: ", "))")
            .font(.caption.monospaced())
          Text("Discarded messages: \(discardCount)")
        }

        Section("Captured messages, newest first") {
          if entries.isEmpty {
            Text("No matching messages captured yet.")
              .foregroundStyle(.secondary)
          } else {
            ForEach(entries) { entry in
              VStack(alignment: .leading, spacing: 6) {
                Text(entry.sender)
                  .font(.headline)
                Text(entry.body)
                  .font(.body)
                  .textSelection(.enabled)
                Text(entry.capturedAt.formatted(date: .abbreviated, time: .standard))
                  .font(.caption)
                  .foregroundStyle(.secondary)
              }
              .padding(.vertical, 4)
            }
          }
        }
      }
      .navigationTitle("Capture spike")
      .toolbar {
        ToolbarItem(placement: .topBarLeading) {
          Button("Close") { dismiss() }
        }
        ToolbarItemGroup(placement: .topBarTrailing) {
          Button("Refresh") { reload() }
          Button("Clear", role: .destructive) {
            AdvisorCaptureSpikeStore.clear()
            reload()
          }
        }
      }
      .onAppear(perform: reload)
      .onChange(of: scenePhase) { _, phase in
        if phase == .active { reload() }
      }
    }
  }

  private func reload() {
    entries = AdvisorCaptureSpikeStore.entries()
    discardCount = AdvisorCaptureSpikeStore.discardCount()
  }
}

struct AdvisorCaptureSpikeDebugLauncher: View {
  @State private var isPresented = false

  var body: some View {
    Button {
      isPresented = true
    } label: {
      Label("Capture spike", systemImage: "ladybug.fill")
        .font(.caption.weight(.bold))
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .foregroundStyle(.black)
        .background(.yellow)
        .clipShape(Capsule())
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
    .accessibilityIdentifier("homeboard.capture-spike.debug")
    .sheet(isPresented: $isPresented) {
      AdvisorCaptureSpikeDebugView()
    }
  }
}
#endif
