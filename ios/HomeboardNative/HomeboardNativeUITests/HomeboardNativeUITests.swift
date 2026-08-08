import XCTest

final class HomeboardNativeUITests: XCTestCase {
  override func setUpWithError() throws {
    continueAfterFailure = false
  }

  func testWelcomeScreenLaunches() {
    let app = XCUIApplication()
    app.launchArguments.append("-homeboard.resetForUITesting")
    app.launch()

    XCTAssertTrue(app.staticTexts["HOMEBOARD"].waitForExistence(timeout: 5))
    XCTAssertTrue(
      app.staticTexts["Find the place everyone can live with."]
        .waitForExistence(timeout: 5)
    )
  }
}
