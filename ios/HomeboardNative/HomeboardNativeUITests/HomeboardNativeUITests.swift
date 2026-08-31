import XCTest

final class HomeboardNativeUITests: XCTestCase {
  override func setUpWithError() throws {
    continueAfterFailure = false
  }

  func testUnauthenticatedLaunchOpensDirectlyIntoTheAppPreview() {
    let app = XCUIApplication()
    app.launchArguments.append("-homeboard.resetForUITesting")
    app.launch()

    let searchPreview = app.buttons["homeboard.preview.search"]
    XCTAssertTrue(searchPreview.waitForExistence(timeout: 5))
    XCTAssertFalse(app.staticTexts["DEMO MODE"].exists)
    XCTAssertFalse(app.staticTexts["Hi—this is Homeboard’s demo."].exists)
  }

  func testPreviewInteractionContinuesDirectlyToAppleSignIn() {
    let app = XCUIApplication()
    app.launchArguments.append("-homeboard.resetForUITesting")
    app.launch()

    let searchPreview = app.buttons["homeboard.preview.search"]
    XCTAssertTrue(searchPreview.waitForExistence(timeout: 5))
    waitUntilHittable(searchPreview)
    searchPreview.tap()

    XCTAssertTrue(app.staticTexts["One account. No password."].waitForExistence(timeout: 5))
  }

  func testPreviewSwipesThroughAppScreensAndIntoSignIn() {
    let app = XCUIApplication()
    app.launchArguments.append("-homeboard.resetForUITesting")
    app.launch()

    let searchPreview = app.buttons["homeboard.preview.search"]
    XCTAssertTrue(searchPreview.waitForExistence(timeout: 5))
    waitUntilHittable(searchPreview)
    searchPreview.swipeUp()

    let shortlistPreview = app.buttons["homeboard.preview.shortlist"]
    XCTAssertTrue(shortlistPreview.waitForExistence(timeout: 5))
    shortlistPreview.swipeUp()

    let updatesPreview = app.buttons["homeboard.preview.updates"]
    XCTAssertTrue(updatesPreview.waitForExistence(timeout: 5))
    updatesPreview.swipeUp()

    XCTAssertTrue(app.staticTexts["One account. No password."].waitForExistence(timeout: 5))
  }

  private func waitUntilHittable(_ element: XCUIElement, timeout: TimeInterval = 5) {
    let expectation = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "hittable == true"),
      object: element
    )
    XCTAssertEqual(XCTWaiter.wait(for: [expectation], timeout: timeout), .completed)
  }
}
