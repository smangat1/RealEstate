import XCTest

final class HomeboardNativeCoreFlowUITests: FixtureUITestCase {
  func testFixtureCredentialsDoNotSurviveOrdinaryDebugLaunch() {
    launchFixture()
    app.terminate()
    app.launchArguments = []
    app.launchEnvironment = [:]
    app.launch()
    XCTAssertTrue(app.staticTexts["Finding a place with friends doesn’t have to end your friendship."].waitForExistence(timeout: 15))
    XCTAssertFalse(app.tabBars.buttons["Group"].exists)
    XCTAssertFalse(app.descendants(matching: .any)["homeboard.fixture.diagnostics"].exists)
  }
  func testWelcomeInviteToggleRevealsCodeFieldWithoutSigningIn() {
    app = XCUIApplication()
    app.launchArguments = ["-homeboard.resetForUITesting"]
    app.launch()
    let hero = app.staticTexts["Finding a place with friends doesn’t have to end your friendship."]
    XCTAssertTrue(hero.waitForExistence(timeout: 10))
    hero.swipeUp()
    let toggle = app.buttons["homeboard.welcome.invite-toggle"]
    XCTAssertTrue(toggle.waitForExistence(timeout: 8))
    toggle.tap()
    XCTAssertTrue(app.textFields.firstMatch.waitForExistence(timeout: 8))
    XCTAssertTrue(app.buttons["homeboard.welcome.apple"].exists)
  }
  func testSeededBoardNameAndRoommates() {
    launchFixture()
    reveal(app.buttons["homeboard.settings.open"], upwards: false)
    app.buttons["homeboard.settings.open"].tap()
    XCTAssertTrue(app.staticTexts["SF Search · Sam & Co"].waitForExistence(timeout: 10))
    app.buttons["homeboard.settings.people"].tap()
    XCTAssertTrue(app.staticTexts["Alex"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["Jordan"].exists)
    XCTAssertEqual(app.state, .runningForeground)
    XCTAssertTrue((diagnostics()["unexpected"] as? [String] ?? []).isEmpty)
  }
  func testSeededShortlistShowsExpectedListings() {
    launchFixture()
    app.tabBars.buttons["Shortlist"].tap()
    for title in [
      "2BR in the Mission",
      "3BR Hayes Valley Flat",
      "2BR Noe Valley Sun-Trap",
    ] {
      let listing = app.staticTexts[title].firstMatch
      reveal(listing)
      XCTAssertTrue(listing.exists, "Missing seeded shortlist entry: \(title)")
    }
    assertClean()
  }
  func testCreateBoardThroughSignedInOnboarding() {
    launchFixture(["UITEST_ONBOARDING": "1"])
    let next = app.buttons["homeboard.onboarding.continue"]
    XCTAssertTrue(next.waitForExistence(timeout: 15))
    // The synthetic account has a saved complete brief; change a supported city field,
    // then review each existing step and submit through the real confirmation endpoint.
    let city = app.textFields.firstMatch
    fill(city, "San Francisco, CA")
    for _ in 0..<5 {
      wait("Onboarding step disabled") { next.isEnabled }
      next.tap()
    }
    XCTAssertTrue(app.buttons["Create shared board"].waitForExistence(timeout: 10))
    next.tap()
    XCTAssertTrue(app.tabBars.buttons["Group"].waitForExistence(timeout: 15))
    wait("Board was not created by fixture transport") { self.diagnostics()["created"] as? Bool == true }
    app.tabBars.buttons["Group"].tap()
    reveal(app.buttons["homeboard.settings.open"], upwards: false)
    app.buttons["homeboard.settings.open"].tap()
    XCTAssertTrue(app.staticTexts["Sam's new hunt"].waitForExistence(timeout: 10))
    XCTAssertTrue((diagnostics()["unexpected"] as? [String] ?? []).isEmpty)
  }
  func testAddListingFromSyntheticURL() {
    launchFixture()
    let shortlist = app.tabBars.buttons["Shortlist"]
    XCTAssertTrue(shortlist.waitForExistence(timeout: 10))
    wait("Shortlist tab was not ready") { shortlist.isHittable }
    for _ in 0..<3 where !shortlist.isSelected {
      shortlist.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
      let selected = XCTNSPredicateExpectation(
        predicate: NSPredicate(format: "selected == true"),
        object: shortlist
      )
      if XCTWaiter.wait(for: [selected], timeout: 3) == .completed { break }
    }
    XCTAssertTrue(shortlist.isSelected, "Shortlist tab did not become selected")
    let addListing = app.buttons["Add a listing"]
    XCTAssertTrue(addListing.waitForExistence(timeout: 10))
    addListing.tap()
    app.buttons["Paste a listing link"].tap()
    for (id, text) in [("title", "321 Test Lane"), ("price", "3200"), ("bedrooms", "2"), ("bathrooms", "1")] {
      let field = app.textFields["homeboard.listing.field.\(id)"]
      reveal(field)
      fill(field, text)
    }
    let url = app.textFields["homeboard.listing.url"]
    reveal(url)
    fill(url, "https://example.com/rental/fixture")
    dismissKeyboard()
    app.buttons["homeboard.listing.prefill"].tap()
    XCTAssertTrue(app.staticTexts["Fixture link ready"].waitForExistence(timeout: 10))
    let save = app.buttons["homeboard.listing.save"]
    reveal(save)
    save.tap()
    wait("Listing mutation was not stored") { self.records("storedListings").contains { $0["title"] as? String == "321 Test Lane" } }
    // Close the outer discovery sheet if still presented.
    if app.buttons["Done"].exists { app.buttons["Done"].firstMatch.tap() }
    let listing = app.staticTexts["321 Test Lane"].firstMatch
    reveal(listing)
    XCTAssertTrue(listing.exists)
    assertClean()
  }
  func testInviteCodeLinkAndShareControlWithoutSending() {
    launchFixture()
    reveal(app.buttons["homeboard.settings.open"], upwards: false)
    app.buttons["homeboard.settings.open"].tap()
    app.buttons["homeboard.settings.people"].tap()
    let create = app.buttons["homeboard.invite.create"]
    reveal(create)
    create.tap()
    let submit = app.buttons["Create invite link"]
    XCTAssertTrue(submit.waitForExistence(timeout: 8))
    submit.tap()
    XCTAssertTrue(app.buttons["homeboard.invite.share"].waitForExistence(timeout: 10))
    XCTAssertEqual(app.buttons["homeboard.invite.share"].value as? String, "https://example.com/invite/FIXTURE2")
    XCTAssertEqual(diagnostics()["inviteCode"] as? String, "FIXTURE2")
    XCTAssertEqual(diagnostics()["inviteURL"] as? String, "https://example.com/invite/FIXTURE2")
    XCTAssertTrue((diagnostics()["requests"] as? [String] ?? []).contains("POST /api/mobile/invitations"))
    XCTAssertTrue((diagnostics()["unexpected"] as? [String] ?? []).isEmpty)
  }
  func testListingVoteChangesThatListingState() {
    launchFixture()
    app.tabBars.buttons["Shortlist"].tap()
    let listing = app.staticTexts["2BR in the Mission"].firstMatch
    XCTAssertTrue(listing.waitForExistence(timeout: 10))
    listing.tap()
    XCTAssertTrue(app.staticTexts["$3,200/mo"].waitForExistence(timeout: 10))
    let like = app.buttons["homeboard.listing.vote.fixture-listing-001.like"]
    reveal(like)
    like.tap()
    let votes = app.staticTexts["homeboard.listing.votes.fixture-listing-001"]
    XCTAssertTrue(votes.waitForExistence(timeout: 10))
    XCTAssertEqual(votes.label, "Sam: like")
    let stored = records("storedListings").first { $0["id"] as? String == "fixture-listing-001" }
    XCTAssertEqual((stored?["reactions"] as? [[String: Any]])?.first?["vote"] as? String, "like")
    assertClean()
  }
  func testPlainChatMessagePersistsAndRenders() {
    launchFixture()
    let text = "Let's visit the Mission place this weekend."
    send(text)
    XCTAssertTrue(app.staticTexts[text].waitForExistence(timeout: 15))
    wait("Chat mutation was not stored") { self.records("storedMessages").contains { $0["content"] as? String == text } }
    assertClean()
  }
  func testWalletProgressAndFundTriggerWithoutOpeningPayment() {
    launchFixture(["UITEST_WALLET_INACTIVE": "1"])
    let progress = app.progressIndicators["homeboard.wallet.progress"]
    reveal(progress, upwards: false)
    XCTAssertTrue(progress.exists)
    XCTAssertTrue(app.buttons["homeboard.wallet.fund"].exists)
    XCTAssertFalse(app.otherElements["PaymentSheet"].exists)
    assertClean()
  }

  func testAdvisorBetaFlagOffHidesActiveWalletAndKeepsRoommateChat() {
    launchFixture(["HOMEBOARD_ADVISOR_ENABLED": "0"])
    XCTAssertFalse(app.progressIndicators["homeboard.wallet.progress"].exists)
    XCTAssertFalse(app.buttons["homeboard.wallet.fund"].exists)

    let field = app.textFields["homeboard.chat.field"]
    XCTAssertTrue(field.waitForExistence(timeout: 10))
    XCTAssertEqual(field.placeholderValue, "Message your roommates...")

    let text = "Beta roommate check-in"
    send(text)
    XCTAssertTrue(app.staticTexts[text].waitForExistence(timeout: 15))
    wait("Roommate message was not stored") {
      self.records("storedMessages").contains { $0["content"] as? String == text }
    }
    assertClean()
  }

  func testAdvisorBetaFlagOffHidesInactiveWallet() {
    launchFixture([
      "HOMEBOARD_ADVISOR_ENABLED": "0",
      "UITEST_WALLET_INACTIVE": "1",
    ])
    XCTAssertFalse(app.progressIndicators["homeboard.wallet.progress"].exists)
    XCTAssertFalse(app.buttons["homeboard.wallet.fund"].exists)
    XCTAssertFalse(app.staticTexts["Advisor needs an active board week"].exists)
    assertClean()
  }
  func testSearchTabIsReachable() {
    launchFixture()
    let search = app.tabBars.buttons["Search"]
    XCTAssertTrue(search.waitForExistence(timeout: 10))
    search.tap()
    XCTAssertTrue(search.isSelected)
    XCTAssertEqual(app.state, .runningForeground)
    assertClean()
  }
  func testSettingsSignOutReturnsToUnauthenticatedWelcome() {
    launchFixture()
    reveal(app.buttons["homeboard.settings.open"], upwards: false)
    app.buttons["homeboard.settings.open"].tap()
    let signOut = app.buttons["Sign out"]
    reveal(signOut)
    signOut.tap()
    XCTAssertTrue(app.staticTexts["Finding a place with friends doesn’t have to end your friendship."].waitForExistence(timeout: 12))
    XCTAssertFalse(app.tabBars.buttons["Group"].exists)
    XCTAssertTrue((diagnostics()["unexpected"] as? [String] ?? []).isEmpty)
  }
}
