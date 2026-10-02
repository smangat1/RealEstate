import XCTest

/// These prompts exercise the outreach generation/save pipeline, not factual Q&A quality.
final class HomeboardNativeAdvisorChatUITests: FixtureUITestCase {
  let advisorPrompts = [
    "@advisor draft an email to the agent for the first listing",
    "@advisor what is our combined budget",
    "@advisor which listing fits us best",
    "@advisor draft a casual text asking about parking",
    "@advisor compare the commute for all three listings",
  ]
  func testFiveSequentialPromptsGenerateAndPersistDistinctCards() {
    launchFixture()
    var seen = Set<String>()
    for (index, prompt) in advisorPrompts.enumerated() {
      send(prompt)
      let id = "fixture-advisor-\(index + 1)"
      let text = assertSaved(id, command: prompt)
      XCTAssertTrue(seen.insert(text).inserted)
      let user = app.staticTexts[prompt]
      reveal(user, upwards: false, attempts: 6)
      XCTAssertEqual(user.label, prompt)
      assertClean()
    }
    XCTAssertEqual(diagnostics()["postCount"] as? Int, advisorPrompts.count)
    // Exercise the real read route after saving, rather than trusting only the PATCH reply.
    refreshBoardReadback()
    XCTAssertEqual(records("lastReadMessages").filter { $0["authorName"] as? String == "Advisor" }.count, 5)
    for receipt in records("acceptances").filter({ $0["saved"] as? Bool == true }) {
      let saved = records("lastReadMessages").first { $0["id"] as? String == receipt["messageId"] as? String }?["advisorPayload"] as? [String: Any]
      XCTAssertEqual(saved?["draftText"] as? String, receipt["draftText"] as? String)
    }
    assertClean()
  }
  func testPostFailureRestoresExactPromptWithoutGenerationOrSave() {
    launchFixture(["UITEST_ADVISOR_MODE": "fail"])
    let prompt = advisorPrompts[0]
    send(prompt)
    XCTAssertTrue(app.staticTexts["homeboard.chat.boardError"].waitForExistence(timeout: 15))
    wait("Failed prompt was not restored to the composer") { self.app.textFields["homeboard.chat.field"].value as? String == prompt }
    XCTAssertEqual(records("generations").count, 0)
    XCTAssertEqual(records("acceptances").count, 0)
    XCTAssertEqual(diagnostics()["postCount"] as? Int, 1)
    XCTAssertFalse(app.otherElements["homeboard.advisor.card.fixture-advisor-1"].exists)
    XCTAssertTrue((diagnostics()["unexpected"] as? [String] ?? []).isEmpty)
    XCTAssertEqual(app.state, .runningForeground)
  }
  func testDelayedPostFailureDoesNotOverwriteNewComposerText() {
    launchFixture(["UITEST_ADVISOR_MODE": "delayed-fail"])
    let prompt = advisorPrompts[0]
    let newerDraft = "Do not overwrite this newer roommate message"
    send(prompt)
    wait("Fixture POST did not enter its delayed response window") {
      self.diagnostics()["delayedPostStarted"] as? Bool == true
    }
    XCTAssertFalse(app.staticTexts["homeboard.chat.boardError"].exists)
    wait("Composer did not clear while the delayed POST was pending") {
      let value = self.app.textFields["homeboard.chat.field"].value as? String ?? ""
      return value.isEmpty || value == self.app.textFields["homeboard.chat.field"].placeholderValue
    }
    fill(app.textFields["homeboard.chat.field"], newerDraft)
    XCTAssertTrue(app.staticTexts["homeboard.chat.boardError"].waitForExistence(timeout: 15))
    XCTAssertEqual(app.textFields["homeboard.chat.field"].value as? String, newerDraft)
    XCTAssertEqual(records("generations").count, 0)
    XCTAssertEqual(records("acceptances").count, 0)
    XCTAssertEqual(diagnostics()["postCount"] as? Int, 1)
    XCTAssertFalse(app.otherElements["homeboard.advisor.card.fixture-advisor-1"].exists)
    XCTAssertTrue((diagnostics()["unexpected"] as? [String] ?? []).isEmpty)
    XCTAssertEqual(app.state, .runningForeground)
  }
  func testSaveFailureBlocksCardThenRecoverySavesTheMatchingDraft() {
    launchFixture(["UITEST_ADVISOR_MODE": "save-fail"])
    send(advisorPrompts[0])
    wait("Failed save did not reach transport") { self.records("acceptances").count == 1 }
    let error = app.staticTexts["homeboard.advisor.error.fixture-advisor-1"]
    reveal(error)
    XCTAssertTrue(error.label.contains("Fixture accepted draft save failure"))
    XCTAssertFalse(app.staticTexts["homeboard.advisor.ready.fixture-advisor-1"].exists)
    XCTAssertFalse(app.buttons["homeboard.advisor.email.fixture-advisor-1"].isEnabled)
    XCTAssertFalse(app.buttons["homeboard.advisor.message.fixture-advisor-1"].isEnabled)
    XCTAssertEqual(records("acceptances").first?["saved"] as? Bool, false)
    let retry = app.buttons["advisor-card-recover"]
    reveal(retry, upwards: false)
    retry.tap()
    assertSaved("fixture-advisor-1", command: advisorPrompts[0])
    XCTAssertEqual(diagnostics()["postCount"] as? Int, 1)
    XCTAssertEqual(records("storedMessages").filter { $0["authorName"] as? String == "Advisor" }.count, 1)
    assertClean()
  }
  func testInactiveWalletBlocksPostGenerationAndAcceptance() {
    launchFixture(["UITEST_WALLET_INACTIVE": "1"])
    fill(app.textFields["homeboard.chat.field"], advisorPrompts[0])
    XCTAssertTrue(app.staticTexts["homeboard.advisor.unlock"].waitForExistence(timeout: 8))
    XCTAssertFalse(app.buttons["homeboard.chat.send"].isEnabled)
    XCTAssertEqual(diagnostics()["postCount"] as? Int, 0)
    XCTAssertEqual(records("generations").count, 0)
    XCTAssertEqual(records("acceptances").count, 0)
    XCTAssertTrue((diagnostics()["unexpected"] as? [String] ?? []).isEmpty)
  }
  func testProductionGeneratorUnavailableModelFallbackIsSaved() {
    launchFixture(["UITEST_ADVISOR_PROVIDER": "fallback"])
    send(advisorPrompts[0])
    assertSaved("fixture-advisor-1", command: advisorPrompts[0], source: "device_template")
    XCTAssertEqual(diagnostics()["provider"] as? String, "fallback")
    assertClean()
  }
  func testToneAndIncludedFactRegenerateAndStaleGenerationCannotWin() {
    launchFixture(["UITEST_DELAY_GENERATION": "1"])
    send(advisorPrompts[0])
    let first = assertSaved("fixture-advisor-1", command: advisorPrompts[0])
    let casual = app.buttons["homeboard.advisor.tone.fixture-advisor-1.Casual"]
    reveal(casual)
    casual.tap()
    wait("Casual tone was not selected") { casual.value as? String == "Selected" }
    wait("Delayed tone generation did not start") { self.records("generations").contains { $0["tone"] as? String == "Casual" } }
    let toggle = app.buttons["homeboard.advisor.toggle.fixture-advisor-1.requirements"]
    reveal(toggle)
    toggle.tap()
    let stern = app.buttons["homeboard.advisor.tone.fixture-advisor-1.Stern"]
    reveal(stern, upwards: false)
    stern.tap()
    wait("Latest tone and toggle were not persisted") {
      self.records("acceptances").contains {
        $0["saved"] as? Bool == true && $0["tone"] as? String == "Stern"
          && ($0["toggleOptions"] as? [[String: Any]])?.first?["enabled"] as? Bool == false
      }
    }
    wait("Delayed work did not settle") { self.records("generations").allSatisfy { $0["completed"] as? Bool == true } }
    let completed = records("generations")
    let staleOrder = completed.first { $0["tone"] as? String == "Casual" }?["completionOrder"] as? Int ?? 0
    let latestOrder = completed.last { $0["tone"] as? String == "Stern" }?["completionOrder"] as? Int ?? 0
    XCTAssertGreaterThan(staleOrder, latestOrder, "The delayed old generation must finish after the latest choice")
    let final = assertSaved("fixture-advisor-1", command: advisorPrompts[0])
    XCTAssertNotEqual(first, final)
    XCTAssertEqual(records("acceptances").last?["tone"] as? String, "Stern")
    XCTAssertTrue(final.contains("Stern"))
    assertClean()
  }
}

/// Opt-in lane. Never counts fallback or a test provider as a real inference pass.
final class HomeboardNativeAppleIntelligenceUITests: FixtureUITestCase {
  func testRealOnDeviceGenerationAndToneRegeneration() throws {
    guard ProcessInfo.processInfo.environment["HOMEBOARD_RUN_REAL_AI"] == "1" else {
      throw XCTSkip("Opt-in: set HOMEBOARD_RUN_REAL_AI=1 in the UI test runner scheme on a supported iOS 26+ device with Apple Intelligence enabled and its model downloaded.")
    }
    launchFixture(["UITEST_ADVISOR_PROVIDER": "apple_intelligence"])
    guard diagnostics()["modelAvailable"] as? Bool == true else {
      throw XCTSkip("Production model unavailable on this destination: \(diagnostics()["availability"] ?? "unknown")")
    }
    let command = "@advisor draft an email to the agent for the first listing"
    send(command)
    let first = assertSaved(
      "fixture-advisor-1",
      command: command,
      source: "apple_intelligence",
      tone: "Professional",
      timeout: 120
    )
    let acceptanceBoundary = records("acceptances").count
    let generationBoundary = records("generations").count
    let tone = app.buttons["homeboard.advisor.tone.fixture-advisor-1.Casual"]
    reveal(tone)
    tone.tap()
    let casual = assertSaved(
      "fixture-advisor-1",
      command: command,
      source: "apple_intelligence",
      tone: "Casual",
      afterAcceptanceCount: acceptanceBoundary,
      afterGenerationCount: generationBoundary,
      timeout: 120
    )
    XCTAssertNotEqual(first, casual, "A new tone must render the newly accepted generator output")
    refreshBoardReadback(timeout: 60)
    assertReadback(
      "fixture-advisor-1",
      text: casual,
      tone: "Casual",
      source: "apple_intelligence"
    )
    assertClean()
  }
}
