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

  func testGuestDemoGatesBoardControlsBehindAuthentication() {
    let app = XCUIApplication()
    app.launchArguments.append("-homeboard.resetForUITesting")
    app.launch()

    XCTAssertTrue(app.staticTexts["HOMEBOARD"].waitForExistence(timeout: 5))
    app.swipeUp()

    let openDemo = app.buttons["homeboard.demo.open"]
    XCTAssertTrue(openDemo.waitForExistence(timeout: 5))
    openDemo.tap()

    XCTAssertTrue(app.staticTexts["Hi—this is Homeboard’s demo."].waitForExistence(timeout: 5))
    let lookAround = app.buttons["homeboard.demo.lookAround"]
    XCTAssertTrue(lookAround.exists)
    lookAround.tap()

    XCTAssertFalse(app.tabBars.firstMatch.exists)
    XCTAssertTrue(app.buttons["homeboard.demo.signIn"].waitForExistence(timeout: 3))
    XCTAssertTrue(app.buttons["homeboard.demo.createAccount"].exists)

    let interactionGate = app.buttons["homeboard.demo.interactionGate"]
    XCTAssertTrue(interactionGate.waitForExistence(timeout: 3))
    interactionGate.tap()

    XCTAssertTrue(app.staticTexts["Ready to make it yours?"].waitForExistence(timeout: 3))
    XCTAssertTrue(app.buttons["homeboard.demo.promptCreateAccount"].exists)
  }
}
