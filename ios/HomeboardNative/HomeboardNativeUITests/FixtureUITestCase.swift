import XCTest

class FixtureUITestCase: XCTestCase {
  var app: XCUIApplication!
  override func setUpWithError() throws { continueAfterFailure = false }
  override func tearDownWithError() throws { app?.terminate() }

  func launchFixture(_ settings: [String: String] = [:]) {
    app = XCUIApplication()
    app.launchArguments = ["-homeboard.resetForUITesting", "-homeboard.uiTestFixture"]
    app.launchEnvironment.merge(settings) { _, new in new }
    app.launch()
    XCTAssertTrue(app.descendants(matching: .any)["homeboard.fixture.diagnostics"].waitForExistence(timeout: 20))
    if settings["UITEST_ONBOARDING"] != "1" {
      XCTAssertTrue(app.tabBars.buttons["Group"].waitForExistence(timeout: 15))
    }
  }
  func diagnostics() -> [String: Any] {
    let value = app.descendants(matching: .any)["homeboard.fixture.diagnostics"].value as? String ?? "{}"
    return (try? JSONSerialization.jsonObject(with: Data(value.utf8))) as? [String: Any] ?? [:]
  }
  func records(_ name: String) -> [[String: Any]] { diagnostics()[name] as? [[String: Any]] ?? [] }
  func wait(_ description: String, timeout: TimeInterval = 20, condition: @escaping () -> Bool) {
    let expectation = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in condition() }, object: nil)
    let result = XCTWaiter.wait(for: [expectation], timeout: timeout)
    if result != .completed {
      let screenshot = XCTAttachment(screenshot: app.screenshot())
      screenshot.lifetime = .keepAlways
      add(screenshot)
      let state = XCTAttachment(string: "\(diagnostics())\n\(app.debugDescription)")
      state.lifetime = .keepAlways
      add(state)
    }
    XCTAssertEqual(result, .completed, description)
  }
  func reveal(_ element: XCUIElement, upwards: Bool = true, attempts: Int = 12) {
    // Ignore the card's horizontal tone/fact strips; use the foreground vertical sheet/page.
    let scroll = app.scrollViews.allElementsBoundByIndex.last(where: { $0.isHittable && $0.frame.height > 200 }) ?? app.scrollViews.firstMatch
    for _ in 0..<attempts {
      var viewport = scroll.frame.intersection(app.frame)
      let composer = app.textFields["homeboard.chat.field"]
      if composer.exists && composer.isHittable {
        viewport.size.height = max(0, min(viewport.maxY, composer.frame.minY - 10) - viewport.minY)
      }
      if app.keyboards.firstMatch.exists {
        viewport.size.height = max(0, min(viewport.maxY, app.keyboards.firstMatch.frame.minY - 100) - viewport.minY)
      }
      if element.exists && element.isHittable && (element.elementType == .staticText || viewport.contains(element.frame)) { return }
      let scrollUp: Bool
      if element.exists && element.frame.minY < viewport.minY { scrollUp = false }
      else if element.exists && element.frame.maxY > viewport.maxY { scrollUp = true }
      else { scrollUp = upwards }
      // SwiftUI may report the page's full frame underneath its safe-area composer
      // and keyboard. Keep the gesture inside the actually exposed content area.
      let origin = app.coordinate(withNormalizedOffset: .zero)
      let start = origin.withOffset(CGVector(dx: viewport.midX, dy: viewport.minY + viewport.height * (scrollUp ? 0.75 : 0.25)))
      let end = origin.withOffset(CGVector(dx: viewport.midX, dy: viewport.minY + viewport.height * (scrollUp ? 0.25 : 0.75)))
      start.press(forDuration: 0.05, thenDragTo: end)
    }
    XCTFail("Control remains offscreen: \(element)")
  }
  func dismissKeyboard() {
    guard app.keyboards.firstMatch.exists else { return }
    let done = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Done")).firstMatch
    if done.exists && done.isHittable { done.tap() }
    else if app.keyboards.buttons["Return"].exists { app.keyboards.buttons["Return"].tap() }
    else { app.scrollViews.allElementsBoundByIndex.last(where: { $0.isHittable && $0.frame.height > 200 })?.swipeDown() }
    wait("Keyboard did not dismiss") { !self.app.keyboards.firstMatch.exists }
  }
  func fill(_ field: XCUIElement, _ text: String) {
    XCTAssertTrue(field.waitForExistence(timeout: 10))
    wait("Field was not hittable") { field.isHittable }
    for _ in 0..<3 {
      field.tap()
      if app.keyboards.firstMatch.waitForExistence(timeout: 5) { break }
    }
    XCTAssertTrue(app.keyboards.firstMatch.exists, "Field did not receive keyboard focus")
    let current = field.value as? String ?? ""
    if !current.isEmpty && current != field.placeholderValue && !(field.placeholderValue ?? "").hasPrefix(current.replacingOccurrences(of: "...", with: "")) {
      field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count))
    }
    field.typeText(text)
  }
  func send(_ text: String) {
    fill(app.textFields["homeboard.chat.field"], text)
    let button = app.buttons["homeboard.chat.send"]
    XCTAssertTrue(button.isEnabled)
    button.tap()
  }
  func assertClean(file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertTrue((diagnostics()["unexpected"] as? [String] ?? ["diagnostics missing"]).isEmpty, "Unexpected fixture request: \(diagnostics())", file: file, line: line)
    XCTAssertFalse(app.staticTexts["homeboard.chat.boardError"].exists, file: file, line: line)
    XCTAssertFalse(app.buttons["advisor-card-recover"].exists, file: file, line: line)
    XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "identifier BEGINSWITH %@", "homeboard.advisor.error.")).firstMatch.exists, file: file, line: line)
    XCTAssertFalse(app.alerts.firstMatch.exists, file: file, line: line)
    XCTAssertEqual(app.state, .runningForeground, file: file, line: line)
  }
  @discardableResult
  func assertSaved(
    _ id: String,
    command: String,
    source: String = "device_template",
    tone: String? = nil,
    afterAcceptanceCount: Int = 0,
    afterGenerationCount: Int = 0,
    timeout: TimeInterval = 30
  ) -> String {
    wait("Matching generation and acceptance did not finish", timeout: timeout) {
      self.records("acceptances").dropFirst(afterAcceptanceCount).contains {
        $0["messageId"] as? String == id
          && $0["saved"] as? Bool == true
          && $0["generationSource"] as? String == source
          && (tone == nil || $0["tone"] as? String == tone)
      }
    }
    guard let receipt = records("acceptances").dropFirst(afterAcceptanceCount).last(where: {
      $0["messageId"] as? String == id
        && $0["saved"] as? Bool == true
        && $0["generationSource"] as? String == source
        && (tone == nil || $0["tone"] as? String == tone)
    }) else {
      XCTFail("No new matching saved acceptance after boundary \(afterAcceptanceCount)")
      return ""
    }
    let text = receipt["draftText"] as? String ?? ""
    XCTAssertFalse(text.isEmpty)
    XCTAssertFalse(text.contains("Initial server template"))
    XCTAssertNil(text.range(of: #"\[[^\]\n]{1,80}\]"#, options: .regularExpression))
    XCTAssertLessThanOrEqual(text.count, 4000)
    XCTAssertEqual(receipt["originalCommand"] as? String, command)
    XCTAssertEqual(receipt["boardId"] as? String, "fixture-board-001")
    XCTAssertEqual(receipt["generationSource"] as? String, source)
    if let tone { XCTAssertEqual(receipt["tone"] as? String, tone) }
    XCTAssertNotNil(receipt["clientGeneratedAt"] as? String)
    let generation = records("generations").dropFirst(afterGenerationCount).last {
      $0["messageId"] as? String == id
        && $0["text"] as? String == text
        && $0["source"] as? String == source
        && (tone == nil || $0["tone"] as? String == tone)
    }
    XCTAssertEqual(generation?["originalCommand"] as? String, command)
    XCTAssertEqual(generation?["source"] as? String, source)
    if let tone { XCTAssertEqual(generation?["tone"] as? String, tone) }
    let context = generation?["context"] as? [String: Any]
    XCTAssertNotNil(context?["requirements"])
    let stored = records("storedMessages").first { $0["id"] as? String == id }?["advisorPayload"] as? [String: Any]
    XCTAssertEqual(stored?["draftText"] as? String, text)
    XCTAssertEqual(stored?["generationSource"] as? String, source)
    XCTAssertEqual(stored?["executionStatus"] as? String, "draft_ready")
    XCTAssertNotNil(stored?["acceptedAt"] as? String)
    let draft = app.staticTexts["homeboard.advisor.draft.\(id)"]
    reveal(draft, upwards: false, attempts: 6)
    wait("Rendered card did not match persisted generated text") { draft.label == text }
    let ready = app.staticTexts["homeboard.advisor.ready.\(id)"]
    reveal(ready, upwards: false, attempts: 4)
    XCTAssertTrue(ready.exists)
    XCTAssertFalse(app.progressIndicators["homeboard.advisor.generating.\(id)"].exists)
    return text
  }

  func refreshBoardReadback(timeout: TimeInterval = 30) {
    let before = diagnostics()["boardReadCount"] as? Int ?? 0
    reveal(app.buttons["homeboard.settings.open"], upwards: false, attempts: 30)
    let scroll = app.scrollViews.firstMatch
    scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.2))
      .press(forDuration: 0.1, thenDragTo: scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.8)))
    wait("Saved board was not read back", timeout: timeout) {
      (self.diagnostics()["boardReadCount"] as? Int ?? 0) > before
    }
  }

  func assertReadback(
    _ id: String,
    text: String,
    tone: String,
    source: String,
    file: StaticString = #filePath,
    line: UInt = #line
  ) {
    let payload = records("lastReadMessages").first {
      $0["id"] as? String == id
    }?["advisorPayload"] as? [String: Any]
    XCTAssertEqual(payload?["messageId"] as? String, id, file: file, line: line)
    XCTAssertEqual(payload?["draftText"] as? String, text, file: file, line: line)
    XCTAssertEqual(payload?["tone"] as? String, tone, file: file, line: line)
    XCTAssertEqual(payload?["generationSource"] as? String, source, file: file, line: line)
    XCTAssertEqual(payload?["executionStatus"] as? String, "draft_ready", file: file, line: line)
    XCTAssertNotNil(payload?["acceptedAt"] as? String, file: file, line: line)
  }
}
