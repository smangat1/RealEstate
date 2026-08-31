import XCTest

final class HomeboardNativeUITests: XCTestCase {
  override func setUpWithError() throws {
    continueAfterFailure = false
  }

  func testUnauthenticatedLaunchOpensDirectlyIntoTheAppPreview() {
    let app = XCUIApplication()
    app.launchArguments.append("-homeboard.resetForUITesting")
    app.launch()

    let searchPreview = app.buttons["homeboard.preview.interaction"]
    XCTAssertTrue(searchPreview.waitForExistence(timeout: 5))
    XCTAssertFalse(app.staticTexts["DEMO MODE"].exists)
    XCTAssertFalse(app.staticTexts["Hi—this is Homeboard’s demo."].exists)
  }

  func testPreviewInteractionContinuesDirectlyToAppleSignIn() {
    let app = XCUIApplication()
    app.launchArguments.append("-homeboard.resetForUITesting")
    app.launch()

    let searchPreview = app.buttons["homeboard.preview.interaction"]
    XCTAssertTrue(searchPreview.waitForExistence(timeout: 5))
    waitUntilHittable(searchPreview)
    searchPreview.tap()

    XCTAssertTrue(app.staticTexts["Make this search yours"].waitForExistence(timeout: 5))
    let continueButton = app.buttons["homeboard.preview.continue"]
    XCTAssertTrue(continueButton.exists)
    continueButton.tap()

    XCTAssertTrue(app.staticTexts["Get into the workspace."].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["Continue with Apple"].exists)
  }

  func testMovingThePreviewMapShowsTheSignInPrompt() {
    let app = XCUIApplication()
    app.launchArguments.append("-homeboard.resetForUITesting")
    app.launch()

    let searchPreview = app.buttons["homeboard.preview.interaction"]
    XCTAssertTrue(searchPreview.waitForExistence(timeout: 5))
    waitUntilHittable(searchPreview)
    searchPreview.swipeLeft()

    XCTAssertTrue(app.staticTexts["Make this search yours"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["homeboard.preview.continue"].exists)
  }

  private func waitUntilHittable(_ element: XCUIElement, timeout: TimeInterval = 5) {
    let expectation = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "hittable == true"),
      object: element
    )
    XCTAssertEqual(XCTWaiter.wait(for: [expectation], timeout: timeout), .completed)
  }
}
