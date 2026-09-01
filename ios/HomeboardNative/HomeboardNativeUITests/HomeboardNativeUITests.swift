import XCTest

final class HomeboardNativeUITests: XCTestCase {
  override func setUpWithError() throws {
    continueAfterFailure = false
  }

  func testUnauthenticatedLaunchOpensTheWelcomeStory() {
    let app = XCUIApplication()
    app.launchArguments.append("-homeboard.resetForUITesting")
    app.launch()

    let hero = app.staticTexts["Finding a place with friends doesn’t have to end your friendship."]
    XCTAssertTrue(hero.waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["Swipe up to continue"].exists)
    XCTAssertFalse(app.buttons["homeboard.preview.interaction"].exists)
    XCTAssertFalse(app.staticTexts["DEMO MODE"].exists)
  }

  func testSwipeOpensBothAccountPathsWithoutAHiddenPreviewPrompt() {
    let app = XCUIApplication()
    app.launchArguments.append("-homeboard.resetForUITesting")
    app.launch()

    let hero = app.staticTexts["Finding a place with friends doesn’t have to end your friendship."]
    XCTAssertTrue(hero.waitForExistence(timeout: 5))
    hero.swipeUp()

    let accessTitle = app.staticTexts["Get into the workspace."]
    XCTAssertTrue(accessTitle.waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["Existing users: click the key. New accounts: sign in with Apple."].exists)
    XCTAssertTrue(app.buttons["homeboard.welcome.invite-toggle"].exists)
    waitUntilHittable(app.buttons["homeboard.welcome.apple"])
  }

  func testWelcomeStoryStillSupportsTheUpwardSwipe() {
    let app = XCUIApplication()
    app.launchArguments.append("-homeboard.resetForUITesting")
    app.launch()

    let hero = app.staticTexts["Finding a place with friends doesn’t have to end your friendship."]
    XCTAssertTrue(hero.waitForExistence(timeout: 5))
    hero.swipeUp()

    XCTAssertTrue(app.staticTexts["Get into the workspace."].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["homeboard.welcome.apple"].exists)
  }

  private func waitUntilHittable(_ element: XCUIElement, timeout: TimeInterval = 5) {
    let expectation = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "hittable == true"),
      object: element
    )
    XCTAssertEqual(XCTWaiter.wait(for: [expectation], timeout: timeout), .completed)
  }
}
