#if DEBUG
import XCTest
@testable import HomeboardNative

final class UITestFixtureTests: XCTestCase {
  @MainActor
  func testUnknownRouteFailsClosed() throws {
    let state = UITestFixtureState()
    let request = URLRequest(url: URL(string: "https://homeboard-fixture.invalid/unhandled")!)
    let (status, _) = try state.respond(request, body: Data())
    XCTAssertEqual(status, 599)
    XCTAssertEqual(state.unexpected, ["GET /unhandled"])
    let wrongOrigin = URLRequest(url: URL(string: "https://example.com/api/health")!)
    XCTAssertEqual(try state.respond(wrongOrigin, body: Data()).0, 599)
  }

  @MainActor
  func testAcceptancePersistsSuppliedOutputAndRejectsWrongIdentity() async throws {
    let state = UITestFixtureState()
    let command = "@advisor draft an email to the agent for the first listing"
    var request = URLRequest(url: URL(string: "https://homeboard-fixture.invalid/api/mobile/boards/fixture-board-001/messages")!)
    request.httpMethod = "POST"
    let (_, initial) = try state.respond(request, body: JSONSerialization.data(withJSONObject: ["content": command]))
    var payload = try JSONDecoder().decode(AdvisorMessagePayload.self, from: JSONSerialization.data(withJSONObject: initial["advisorPayload"]!))
    let output = await state.generate(payload: payload, tone: "Stern", toggles: payload.toggleOptions, financialSentence: nil, senderName: "Fixture tenant")
    payload.draftText = output.text
    payload.generationSource = output.source
    payload.tone = "Stern"
    payload.clientGeneratedAt = "2026-09-28T10:00:01.000Z"
    request.httpMethod = "PATCH"
    let bad = try JSONSerialization.data(withJSONObject: ["messageId": "wrong-card", "payload": state.object(payload)])
    XCTAssertEqual(try state.respond(request, body: bad).0, 599)
    XCTAssertTrue(state.acceptances.isEmpty)
    var mislabeled = payload
    mislabeled.generationSource = "apple_intelligence"
    let wrongSource = try JSONSerialization.data(withJSONObject: ["messageId": payload.messageId!, "payload": state.object(mislabeled)])
    XCTAssertEqual(try state.respond(request, body: wrongSource).0, 599)
    let malformed = try JSONSerialization.data(withJSONObject: ["messageId": payload.messageId!, "payload": ["draftText": 42]])
    XCTAssertEqual(try state.respond(request, body: malformed).0, 599)
    XCTAssertTrue(state.acceptances.isEmpty)
    let body = try JSONSerialization.data(withJSONObject: ["messageId": payload.messageId!, "payload": state.object(payload)])
    let (status, saved) = try state.respond(request, body: body)
    XCTAssertEqual(status, 200)
    let returned = saved["advisorPayload"] as! [String: Any]
    XCTAssertEqual(returned["draftText"] as? String, output.text)
    XCTAssertEqual(returned["generationSource"] as? String, "device_template")
    XCTAssertEqual(returned["tone"] as? String, "Stern")
    XCTAssertEqual(returned["clientGeneratedAt"] as? String, payload.clientGeneratedAt)
    XCTAssertNotNil(returned["acceptedAt"])
    request.httpMethod = "GET"
    request.url = URL(string: "https://homeboard-fixture.invalid/api/mobile/boards/fixture-board-001")!
    _ = try state.respond(request, body: Data())
    let readback = state.lastReadMessages.first { $0["id"] as? String == payload.messageId }?["advisorPayload"] as? [String: Any]
    XCTAssertEqual(readback?["draftText"] as? String, output.text)
  }
}
#endif
