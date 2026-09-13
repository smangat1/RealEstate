import XCTest
@testable import HomeboardNative

final class HomeboardNativeTests: XCTestCase {
  private let appModelPersistenceKeys = [
    "homeboard.native.state",
    "homeboard.native.account-session",
    "homeboard.native.profile",
    "homeboard.native.boards-listings",
    "homeboard.native.onboarding",
    "homeboard.native.pending-operations",
  ]

  func testLegacySessionResponseDecodesWithoutForcingOnboarding() throws {
    let response = try JSONDecoder().decode(
      MobileSessionResponse.self,
      from: Data(
        #"{"user":{"id":"app-user-1","email":"user@example.com","displayName":"Sam"},"boards":[{"id":"board-1","title":"Shared search","city":"New York, NY","createdAt":"2026-09-01T00:00:00.000Z","updatedAt":"2026-09-12T00:00:00.000Z"}],"activeBoard":null}"#.utf8
      )
    )

    XCTAssertEqual(response.boards.map(\.id), ["board-1"])
    XCTAssertNil(response.membershipState)
  }

  func testPollVoteIdentityDoesNotConfuseMembersWithTheSameName() throws {
    let decision = ListingDecisionSummary(id: "tour", type: "request_viewing", votes: [
      ListingDecisionVote(name: "Sam", choice: "no", userId: "first-sam"),
      ListingDecisionVote(name: "Sam", choice: "yes", userId: "second-sam")
    ])
    XCTAssertEqual(decision.choice(for: "second-sam"), "yes")
    XCTAssertNil(decision.choice(for: nil))
    XCTAssertNil(decision.choice(for: "unknown"))

    let legacy = try JSONDecoder().decode(ListingDecisionVote.self, from: Data(#"{"name":"Sam","choice":"yes"}"#.utf8))
    XCTAssertNil(legacy.userId)
    XCTAssertEqual(legacy.choice, "yes")
  }

  func testGroupDecisionProgressRequiresEveryoneAndDecodesLegacyPayloads() throws {
    let pending = ListingDecisionSummary(
      id: "tour",
      type: "request_viewing",
      votes: [ListingDecisionVote(name: "Sam", choice: "yes", userId: "sam")],
      resolvedCount: 1,
      requiredCount: 3,
      remainingMemberNames: ["Maya", "Alex"]
    )
    XCTAssertEqual(pending.groupResolvedCount, 1)
    XCTAssertEqual(pending.groupRequiredCount, 3)
    XCTAssertFalse(pending.isGroupResolved)

    let complete = ListingDecisionSummary(
      id: "apply",
      type: "apply",
      votes: [],
      resolvedCount: 3,
      requiredCount: 3
    )
    XCTAssertTrue(complete.isGroupResolved)

    let legacy = try JSONDecoder().decode(
      ListingDecisionSummary.self,
      from: Data(#"{"id":"old","type":"shortlist","closedAt":null,"votes":[]}"#.utf8)
    )
    XCTAssertEqual(legacy.groupResolvedCount, 0)
    XCTAssertEqual(legacy.groupRequiredCount, 2)
    XCTAssertFalse(legacy.isGroupResolved)
  }

  func testOpenPollLookupExcludesClosedDecisionsAndOtherPollTypes() {
    var listing = ListingPreview(
      title: "123 Example Street", location: "New York", priceLine: "$2,000",
      commuteLine: "Compare routes", summary: "", fitLabel: "", highlights: [], openRisks: []
    )
    listing.decisions = [
      ListingDecisionSummary(id: "closed-tour", type: "request_viewing", closedAt: "2026-09-04", votes: []),
      ListingDecisionSummary(id: "apply", type: "apply", votes: []),
      ListingDecisionSummary(id: "open-tour", type: "request_viewing", votes: [])
    ]
    XCTAssertEqual(listing.openDecision(for: .requestViewing)?.id, "open-tour")
    XCTAssertNil(listing.openDecision(for: .shortlist))
  }

  func testPassedShortlistFilterHandlesBothStatusesAndDoesNotLeakIntoTouring() {
    var listing = ListingPreview(
      title: "123 Example Street", location: "New York", priceLine: "$2,000",
      commuteLine: "Compare routes", summary: "", fitLabel: "", highlights: [], openRisks: []
    )
    listing.workflowStatus = "viewing"
    for status in ["passed", "rejected", "REJECTED"] {
      listing.status = status
      XCTAssertTrue(SharedListingFilter.passed.includes(listing))
      XCTAssertTrue(SharedListingFilter.all.includes(listing))
      XCTAssertFalse(SharedListingFilter.active.includes(listing))
      XCTAssertFalse(SharedListingFilter.touring.includes(listing))
    }
    listing.status = "interested"
    XCTAssertTrue(SharedListingFilter.touring.includes(listing))
    XCTAssertFalse(SharedListingFilter.passed.includes(listing))
  }

  func testProfileCompletionTracksEveryRequiredField() {
    var profile = RentalProfile()
    XCTAssertEqual(profile.percentComplete, 0)
    XCTAssertEqual(profile.missingFields.count, 8)

    profile.name = "Sam"
    profile.city = "New York City"
    profile.moveInDate = "August"
    profile.budgetMax = "1700"
    profile.commuteTarget = "350 5th Ave, New York, NY 10118"
    profile.minCommuteMinutes = "5"
    profile.maxCommuteMinutes = "45"
    profile.mustHaves = ["Laundry"]
    profile.dealbreakers = ["Over budget"]
    profile.priorities = ["Commute", "Price"]

    XCTAssertTrue(profile.isBoardReady)
    XCTAssertEqual(profile.percentComplete, 100)
    XCTAssertTrue(profile.missingFields.isEmpty)
  }

  func testCommuteScoreIsEqualInsideTheChosenBand() {
    XCTAssertEqual(
      SharedComparisonMath.commuteScore(
        minutes: 10,
        preferredMinutes: 10,
        maximumMinutes: 35
      ),
      100
    )
    XCTAssertEqual(
      SharedComparisonMath.commuteScore(
        minutes: 22,
        preferredMinutes: 10,
        maximumMinutes: 35
      ),
      100
    )
    XCTAssertEqual(
      SharedComparisonMath.commuteScore(
        minutes: 35,
        preferredMinutes: 10,
        maximumMinutes: 35
      ),
      100
    )
    XCTAssertLessThan(
      SharedComparisonMath.commuteScore(
        minutes: 5,
        preferredMinutes: 10,
        maximumMinutes: 35
      ),
      100
    )
    XCTAssertLessThan(
      SharedComparisonMath.commuteScore(
        minutes: 45,
        preferredMinutes: 10,
        maximumMinutes: 35
      ),
      100
    )
  }

  func testLongCommuteScoreRespectsTheChosenMaximum() {
    XCTAssertEqual(
      SharedComparisonMath.commuteScore(
        minutes: 180,
        preferredMinutes: 30,
        maximumMinutes: 120
      ),
      0
    )
    XCTAssertEqual(
      SharedComparisonMath.commuteScore(
        minutes: 180,
        preferredMinutes: 30,
        maximumMinutes: 180
      ),
      100
    )
  }

  func testListingCoordinatesSurvivePersistenceRoundTrip() throws {
    let listing = ListingPreview(
      title: "21-18 31st Avenue",
      address: "21-18 31st Avenue, Astoria, NY 11106",
      location: "Astoria, Queens, NY 11106",
      priceLine: "$4,650",
      commuteLine: "Compare routes",
      summary: "Sample",
      fitLabel: "Strong shared fit",
      highlights: [],
      openRisks: [],
      latitude: 40.7685,
      longitude: -73.9253
    )

    let data = try JSONEncoder().encode(listing)
    let restored = try JSONDecoder().decode(ListingPreview.self, from: data)

    XCTAssertEqual(try XCTUnwrap(restored.latitude), 40.7685, accuracy: 0.000_001)
    XCTAssertEqual(try XCTUnwrap(restored.longitude), -73.9253, accuracy: 0.000_001)
    XCTAssertEqual(restored.address, "21-18 31st Avenue, Astoria, NY 11106")
  }

  func testScannerDoesNotMistakeListingTitleForCapturedAddress() async {
    let analysis = await HomeboardListingIntelligence.analyze(message: [
      "pageTitle": "900 Broadway, New York, NY 10003 | Similar rentals",
      "address": "1 Meadowlands Pkwy, Secaucus, NJ 07094",
      "city": "Secaucus",
      "region": "NJ",
      "postalCode": "07094"
    ], allowSystemModel: false)

    XCTAssertEqual(analysis.facts.address, "1 Meadowlands Pkwy, Secaucus, NJ 07094")
  }

  func testMapGeocodesVerifiedAddressWithoutTitleOrBoardCity() {
    let listing = ListingPreview(
      title: "Secaucus: Meadowlands apartments",
      address: "1 Meadowlands Pkwy, Secaucus, NJ 07094",
      location: "Secaucus",
      priceLine: "$2,750",
      commuteLine: "Compare routes",
      summary: "Sample",
      fitLabel: "New",
      highlights: [],
      openRisks: []
    )

    XCTAssertEqual(
      SharedListingLocation.geocodingQuery(for: listing),
      "1 Meadowlands Pkwy, Secaucus, NJ 07094"
    )
  }

  func testSafariListingCapturePreservesEnrichedFacts() throws {
    let capture = HomeboardSharedImportStore.PendingImport(
      url: "https://www.zillow.com/homedetails/123-Main-St-4B/123_zpid/",
      canonicalURL: "https://www.zillow.com/homedetails/123-Main-St-4B/123_zpid/",
      boardId: "board-1",
      sourceName: "Zillow",
      pageTitle: "123 Main Street #4B",
      address: "123 Main Street, New York, NY 10001",
      unit: "4B",
      city: "New York",
      neighborhood: "Chelsea",
      latitude: 40.7465,
      longitude: -74.0014,
      price: 4_800,
      bedrooms: 2,
      bathrooms: 1.5,
      squareFeet: 920,
      availableDate: "Aug 15",
      imageURL: "https://photos.example.com/cover.jpg",
      summary: "Bright two-bedroom close to the train.",
      amenities: ["pet friendly", "free laundry"],
      modelInsights: [
        HomeboardListingInsight(
          category: "interior",
          label: "Double vanity",
          sentiment: 0.7,
          confidence: 0.91,
          evidence: "double-sink bathroom vanity"
        )
      ],
      listingScope: "unit",
      extractionConfidence: "high"
    )

    let data = try JSONEncoder().encode(capture)
    let restored = try JSONDecoder().decode(
      HomeboardSharedImportStore.PendingImport.self,
      from: data
    )

    XCTAssertEqual(restored.sourceName, "Zillow")
    XCTAssertEqual(restored.unit, "4B")
    XCTAssertEqual(restored.price, 4_800)
    XCTAssertEqual(restored.bathrooms, 1.5)
    XCTAssertEqual(try XCTUnwrap(restored.latitude), 40.7465, accuracy: 0.000_001)
    XCTAssertEqual(try XCTUnwrap(restored.longitude), -74.0014, accuracy: 0.000_001)
    XCTAssertEqual(restored.squareFeet, 920)
    XCTAssertEqual(restored.availableDate, "Aug 15")
    XCTAssertEqual(restored.amenities, ["pet friendly", "free laundry"])
    XCTAssertEqual(restored.modelInsights.first?.label, "Double vanity")
    XCTAssertEqual(restored.extractionConfidence, "high")
  }

  func testOlderURLOnlyCaptureStillDecodes() throws {
    let data = Data(
      #"{"url":"https://example.com/listing","boardId":"board-1","createdAt":0}"#.utf8
    )
    let restored = try JSONDecoder().decode(
      HomeboardSharedImportStore.PendingImport.self,
      from: data
    )

    XCTAssertEqual(restored.url, "https://example.com/listing")
    XCTAssertEqual(restored.boardId, "board-1")
    XCTAssertNil(restored.price)
    XCTAssertNil(restored.latitude)
    XCTAssertNil(restored.longitude)
    XCTAssertTrue(restored.modelInsights.isEmpty)
  }

  func testListingIntelligenceKeepsBuildingUnitsSeparate() async {
    let evidence = """
      219 Kent Avenue
      Unit 2A · $4,800 · 2 beds · 2 baths
      Unit 5C · $5,250 · 3 beds · 2 baths
      """
    let analysis = await HomeboardListingIntelligence.analyze(message: [
      "listingScope": "building",
      "address": "219 Kent Avenue",
      "pageEvidence": evidence,
      "unitOptions": [
        [
          "id": "2A",
          "label": "Unit 2A",
          "unit": "2A",
          "price": 4_800,
          "bedrooms": 2,
          "bathrooms": 2
        ],
        [
          "id": "5C",
          "label": "Unit 5C",
          "unit": "5C",
          "price": 5_250,
          "bedrooms": 3,
          "bathrooms": 2
        ]
      ]
    ], allowSystemModel: false)

    XCTAssertEqual(analysis.scope, "building")
    XCTAssertEqual(analysis.options.count, 2)
    XCTAssertEqual(analysis.options[0].unit, "2A")
    XCTAssertEqual(analysis.options[0].price, 4_800)
    XCTAssertEqual(analysis.options[1].unit, "5C")
    XCTAssertEqual(analysis.options[1].price, 5_250)
  }

  func testSafariSharePipelineFindsTenUnitsFromTwoInitialCandidates() async {
    let evidence = "Available units\nAll (10)\n" + (1...10).map { index in
      "\(index)A\n2 beds, 1 bath\n850\nNow\n$\(3000 + (index - 1) * 100)"
    }.joined(separator: "\n")
    let scan = await HomeboardListingIntelligence.analyzeWithOneRescan(message: [
      "listingScope": "building",
      "address": "123 Main Street",
      "availabilityPageEvidence": evidence,
      "semanticPageEvidence": evidence,
      "secondaryPageEvidence": evidence,
      "unitOptions": [
        ["unit": "1A", "label": "1A", "price": 3000, "bedrooms": 2, "bathrooms": 1],
        ["unit": "2A", "label": "2A", "price": 3100, "bedrooms": 2, "bathrooms": 1]
      ]
    ], allowSystemModel: false)
    XCTAssertEqual(scan.analysis.options.map(\.unit), (1...10).map { "\($0)A" })
    XCTAssertEqual(scan.analysis.options.map(\.price), (0..<10).map { Double(3000 + $0 * 100) })
    XCTAssertTrue(scan.analysis.options.allSatisfy { $0.bedrooms == 2 && $0.bathrooms == 1 && $0.squareFeet == 850 })
  }

  func testSafariSharePipelineRejectsExtraCandidatesAndUsesEachRowsPrice() async {
    let evidence = "1A\n2 beds, 1 bath\n850\nNow\n$3000\n2A\n2 beds, 1 bath\n850\nNow\n$3100"
    let candidates = (1...5).map { index -> [String: Any] in
      ["unit": "\(index)A", "label": "\(index)A", "price": 3100, "bedrooms": 2, "bathrooms": 1]
    }
    let scan = await HomeboardListingIntelligence.analyzeWithOneRescan(message: [
      "listingScope": "building", "address": "123 Main Street",
      "availabilityPageEvidence": evidence,
      "pageEvidence": "Recommended unit 3A 2 beds 1 bath $3100. Unavailable unit 4A 2 beds 1 bath $3100. Unit 5A 2 beds 1 bath $3100",
      "unitOptions": candidates
    ], allowSystemModel: false)
    XCTAssertEqual(scan.analysis.options.map(\.unit), ["1A", "2A"])
    XCTAssertEqual(scan.analysis.options.map(\.price), [3000, 3100])
  }

  func testSafariEmptyAvailabilityRejectsCandidatesFromGeneralPageCopy() async {
    let scan = await HomeboardListingIntelligence.analyzeWithOneRescan(message: [
      "listingScope": "building", "address": "123 Main Street",
      "availabilityPageEvidence": "", "structuredUnitEvidence": "",
      "pageEvidence": "Unit 3A 2 beds 1 bath $3100",
      "unitOptions": [["unit": "3A", "label": "3A", "price": 3100, "bedrooms": 2, "bathrooms": 1]]
    ], allowSystemModel: false)
    XCTAssertTrue(scan.analysis.options.isEmpty)
  }

  func testPartialBuildingOptionsStillRequestResolution() async {
    let evidence = "Available units\nAll (10)\n1A\n2 beds, 1 bath\n850\nNow\n$3000"
    let message: [String: Any] = ["listingScope": "building", "address": "123 Main Street", "availabilityPageEvidence": evidence]
    let analysis = await HomeboardListingIntelligence.analyze(message: message, allowSystemModel: false)
    XCTAssertEqual(analysis.options.count, 1)
    let plan = HomeboardListingIntelligence.systemModelResolutionPlan(message: message, facts: analysis.facts, options: analysis.options)
    XCTAssertTrue(plan.fields.contains("options"))
  }

  func testSafariGesturePracticeRequiresLeftRightThenDown() {
    var step = SafariGesturePracticeStep.swipeLeft
    step.record(.down)
    step.record(.right)
    XCTAssertEqual(step, .swipeLeft)
    step.record(.left)
    XCTAssertEqual(step, .swipeRight)
    step.record(.down)
    XCTAssertEqual(step, .swipeRight)
    step.record(.right)
    XCTAssertEqual(step, .swipeDown)
    step.record(.left)
    XCTAssertEqual(step, .swipeDown)
    step.record(.down)
    XCTAssertEqual(step, .complete)
  }

  func testListingIntelligenceParsesZillowStyleAvailabilityRows() async {
    let evidence = """
      Unit
      Sqft
      Avail.
      Base rent
      1923
      Studio, 1 ba
      392
      Oct 13
      $2,232
      807
      Studio, 1 ba
      422
      Aug 11
      $2,403
      607
      Studio, 1 ba
      422
      Now
      $2,403
      1806
      Studio, 1 ba
      437
      Now
      $2,488
      506
      Studio, 1 ba
      437
      Aug 25
      $2,488
      """
    let analysis = await HomeboardListingIntelligence.analyze(message: [
      "listingScope": "building",
      "address": "Example apartment building",
      "pageEvidence": evidence
    ], allowSystemModel: false)

    XCTAssertEqual(analysis.scope, "building")
    XCTAssertEqual(analysis.options.map(\.unit), ["1923", "807", "607", "1806", "506"])
    XCTAssertEqual(analysis.options[0].bedrooms, 0)
    XCTAssertEqual(analysis.options[0].bathrooms, 1)
    XCTAssertEqual(analysis.options[0].squareFeet, 392)
    XCTAssertEqual(analysis.options[0].availableDate, "Oct 13")
    XCTAssertEqual(analysis.options[0].price, 2_232)
    XCTAssertEqual(analysis.options[2].availableDate, "Now")
    XCTAssertEqual(analysis.options[4].price, 2_488)
  }

  func testBuildingAddressIsSharedWithoutBorrowingFactsAcrossUnitRows() async {
    let analysis = await HomeboardListingIntelligence.analyze(message: [
      "listingScope": "building",
      "pageTitle": "The Junction Apartments",
      "sharedPageEvidence": """
        The Junction Apartments
        300 Main Street, Jersey City, NJ 07302
        """,
      "pageEvidence": """
        Unit
        Sqft
        Avail.
        Base rent
        1A
        Studio, 1 ba
        405
        Now
        2B
        1 bed, 1 ba
        710
        Aug 15
        $2,650
        """
    ], allowSystemModel: false)

    XCTAssertEqual(analysis.scope, "building")
    XCTAssertEqual(analysis.facts.address, "300 Main Street, Jersey City, NJ 07302")
    XCTAssertNil(analysis.facts.unit)
    XCTAssertNil(analysis.facts.price)
    XCTAssertNil(analysis.facts.bedrooms)
    XCTAssertEqual(analysis.options.count, 1)
    XCTAssertEqual(analysis.options[0].unit, "2B")
    XCTAssertEqual(analysis.options[0].price, 2_650)
    XCTAssertEqual(analysis.options[0].squareFeet, 710)
    XCTAssertEqual(analysis.options[0].availableDate, "Aug 15")
  }

  func testAddressRankingPrefersStructuredListingAddressOverNearbyHomes() {
    let address = HomeboardListingIntelligence.bestStreetAddress(from: [
      HomeboardAddressEvidence(
        text: "Similar homes near 88 Wrong Street, Brooklyn, NY 11201",
        source: "addressNode"
      ),
      HomeboardAddressEvidence(
        text: "300 Main Street, Jersey City, NJ 07302",
        source: "jsonld"
      ),
      HomeboardAddressEvidence(
        text: "The Junction | 300 Main Street, Jersey City, NJ 07302",
        source: "title"
      )
    ])

    XCTAssertEqual(address, "300 Main Street, Jersey City, NJ 07302")
  }

  func testAddressRankingUsesAgreementAndKeepsBuildingUnitSeparate() {
    let address = HomeboardListingIntelligence.bestStreetAddress(from: [
      HomeboardAddressEvidence(
        text: "219 Kent Avenue Apt 5C",
        source: "h1"
      ),
      HomeboardAddressEvidence(
        text: "219 Kent Avenue, Brooklyn, NY 11249",
        source: "itemprop"
      ),
      HomeboardAddressEvidence(
        text: "219-Kent-Avenue-5C-Brooklyn-NY-11249",
        source: "canonical"
      )
    ])

    XCTAssertEqual(address, "219 Kent Avenue, Brooklyn, NY 11249")
  }

  func testAddressRankingJoinsStreetAndLocalityAcrossLines() {
    let address = HomeboardListingIntelligence.bestStreetAddress(from: [
      HomeboardAddressEvidence(
        text: """
          625 West 57th Street
          New York, NY 10019
          """,
        source: "addressNode"
      )
    ])

    XCTAssertEqual(address, "625 West 57th Street, New York, NY 10019")
  }

  func testFullAddressEnrichesHigherConfidenceStreetOnlyEvidence() {
    let address = HomeboardListingIntelligence.bestStreetAddress(from: [
      HomeboardAddressEvidence(
        text: "625 West 57th Street",
        source: "itemprop"
      ),
      HomeboardAddressEvidence(
        text: "Rent at 625 West 57th Street, New York, NY 10019",
        source: "title"
      )
    ])

    XCTAssertEqual(address, "625 West 57th Street, New York, NY 10019")
  }

  func testSupportingRecommendationCannotReplacePrimaryListingPrice() async {
    let analysis = await HomeboardListingIntelligence.analyze(message: [
      "primaryPageEvidence": """
        625 West 57th Street, New York, NY 10019
        $4,800 per month · 2 beds · 2 baths
        """,
      "pageEvidence": """
        [PRIMARY]
        625 West 57th Street, New York, NY 10019
        $4,800 per month · 2 beds · 2 baths

        [SUPPORTING]
        Similar homes
        88 Wrong Street
        $2,200 per month · Studio · 1 bath
        """
    ], allowSystemModel: false)

    XCTAssertEqual(analysis.facts.price, 4_800)
    XCTAssertEqual(analysis.facts.bedrooms, 2)
    XCTAssertEqual(analysis.facts.bathrooms, 2)
    XCTAssertEqual(
      analysis.facts.address,
      "625 West 57th Street, New York, NY 10019"
    )
  }

  func testSupportingRecommendationCannotSupplyMissingMainRent() async {
    let analysis = await HomeboardListingIntelligence.analyze(message: [
      "primaryPageEvidence": "625 West 57th Street, New York, NY 10019",
      "pageEvidence": """
        [SUPPORTING]
        Similar homes
        $2,200 per month · Studio · 1 bath
        """
    ], allowSystemModel: false)

    XCTAssertNil(analysis.facts.price)
    XCTAssertNil(analysis.facts.bedrooms)
    XCTAssertNil(analysis.facts.bathrooms)
  }

  func testTrustedPageFactsSupplyRentAndBathroomsBelowFirstViewport() async {
    let analysis = await HomeboardListingIntelligence.analyze(message: [
      "primaryPageEvidence": """
        625 West 57th Street, New York, NY 10019
        """,
      "bedrooms": 2,
      "primaryFactEvidence": """
        Monthly rent $4,800
        Bathrooms: 1.5
        """,
      "semanticPageEvidence": """
        Similar homes
        $2,200 per month
        Studio, 1 bath
        """
    ], allowSystemModel: false)

    XCTAssertEqual(analysis.facts.price, 4_800)
    XCTAssertEqual(analysis.facts.bathrooms, 1.5)
    XCTAssertEqual(analysis.facts.bedrooms, 2)
  }

  func testTrustedBaseRentWithoutDollarSignIsRecognized() async {
    let analysis = await HomeboardListingIntelligence.analyze(message: [
      "primaryFactEvidence": """
        Base rent: 2650
        2 bathrooms
        """
    ], allowSystemModel: false)

    XCTAssertEqual(analysis.facts.price, 2_650)
    XCTAssertEqual(analysis.facts.bathrooms, 2)
  }

  func testBedroomAndBathroomAbbreviationsAreRecognized() async {
    let analysis = await HomeboardListingIntelligence.analyze(message: [
      "primaryFactEvidence": """
        $3,950 per month
        2 bd · 1.5 ba
        """
    ], allowSystemModel: false)

    XCTAssertEqual(analysis.facts.price, 3_950)
    XCTAssertEqual(analysis.facts.bedrooms, 2)
    XCTAssertEqual(analysis.facts.bathrooms, 1.5)
  }

  func testBedroomAbbreviationCanBeReadWithoutAdjacentBathroom() async {
    let analysis = await HomeboardListingIntelligence.analyze(message: [
      "primaryFactEvidence": """
        Bedrooms: 3
        3 bd
        """
    ], allowSystemModel: false)

    XCTAssertEqual(analysis.facts.bedrooms, 3)
  }

  func testSelectiveSystemModelTargetsInsightsForCompleteListing() {
    let facts = HomeboardListingFacts(
      address: "625 West 57th Street, New York, NY 10019",
      unit: "4B",
      city: "New York",
      neighborhood: "Hell's Kitchen",
      price: 4_800,
      bedrooms: 2,
      bathrooms: 2,
      squareFeet: 900,
      imageURL: nil,
      summary: nil,
      amenities: []
    )
    let plan = HomeboardListingIntelligence.systemModelResolutionPlan(
      message: [
        "listingScope": "unit",
        "primaryPageEvidence": """
          625 West 57th Street, New York, NY 10019
          Unit 4B · $4,800 per month · 2 bd · 2 ba
          """
      ],
      facts: facts,
      options: []
    )

    XCTAssertTrue(plan.shouldRun)
    XCTAssertEqual(plan.fields, ["insights"])
  }

  func testSelectiveSystemModelTargetsMissingAndConflictingFields() {
    let facts = HomeboardListingFacts(
      address: "625 West 57th Street, New York, NY 10019",
      unit: "4B",
      city: "New York",
      neighborhood: nil,
      price: 4_800,
      bedrooms: 2,
      bathrooms: nil,
      squareFeet: nil,
      imageURL: nil,
      summary: nil,
      amenities: []
    )
    let plan = HomeboardListingIntelligence.systemModelResolutionPlan(
      message: [
        "listingScope": "unit",
        "primaryPageEvidence": """
          625 West 57th Street, New York, NY 10019
          Unit 4B · $4,800 per month · 2 bd
          Rent: $5,100 · 3 bd · 1.5 ba
          """
      ],
      facts: facts,
      options: []
    )

    XCTAssertTrue(plan.shouldRun)
    XCTAssertTrue(plan.fields.contains("price"))
    XCTAssertTrue(plan.fields.contains("bedrooms"))
    XCTAssertTrue(plan.fields.contains("bathrooms"))
  }

  func testResolvedBuildingOptionsDoNotTriggerCoreFieldModelPass() {
    let facts = HomeboardListingFacts(
      address: "219 Kent Avenue, Brooklyn, NY 11249",
      unit: nil,
      city: "Brooklyn",
      neighborhood: nil,
      price: nil,
      bedrooms: nil,
      bathrooms: nil,
      squareFeet: nil,
      imageURL: nil,
      summary: nil,
      amenities: []
    )
    let option = HomeboardUnitOption(
      id: "3B",
      label: "Unit 3B",
      unit: "3B",
      price: 4_800,
      bedrooms: 3,
      bathrooms: 2,
      squareFeet: 1_100,
      availableDate: nil,
      evidenceSummary: nil
    )
    let plan = HomeboardListingIntelligence.systemModelResolutionPlan(
      message: [
        "listingScope": "building",
        "primaryPageEvidence": "Unit 3B · $4,800 · 3 bd · 2 ba"
      ],
      facts: facts,
      options: [option]
    )

    XCTAssertEqual(plan.fields, ["insights"])
  }

  func testAddressComponentsCompleteAStreetOnlyCapture() async {
    let analysis = await HomeboardListingIntelligence.analyze(message: [
      "address": "625 West 57th Street",
      "city": "New York",
      "region": "NY",
      "postalCode": "10019"
    ], allowSystemModel: false)

    XCTAssertEqual(
      analysis.facts.address,
      "625 West 57th Street, New York, NY 10019"
    )
  }

  func testAddressCompositionAddsPostalCodeToCityAndStateAddress() {
    XCTAssertEqual(
      HomeboardListingIntelligence.composedAddress(
        "625 West 57th Street, New York, NY",
        city: "New York",
        region: "NY",
        postalCode: "10019"
      ),
      "625 West 57th Street, New York, NY 10019"
    )
  }

  func testListingIntelligenceRejectsOptionMissingFromEvidence() async {
    let analysis = await HomeboardListingIntelligence.analyze(message: [
      "listingScope": "building",
      "address": "219 Kent Avenue",
      "pageEvidence": "Unit 2A · $4,800 · 2 beds · 2 baths",
      "unitOptions": [
        [
          "id": "9Z",
          "label": "Unit 9Z",
          "unit": "9Z",
          "price": 9_999,
          "bedrooms": 4,
          "bathrooms": 4
        ]
      ]
    ], allowSystemModel: false)

    XCTAssertTrue(analysis.options.isEmpty)
  }

  func testListingIntelligenceAsksForOnlyUnresolvedFacts() async {
    let analysis = await HomeboardListingIntelligence.analyze(message: [
      "listingScope": "unit",
      "address": "123 Main Street",
      "unit": "4B",
      "pageEvidence": "123 Main Street Unit 4B"
    ], allowSystemModel: false)

    XCTAssertEqual(
      analysis.message,
      "We weren’t able to figure this listing out. Would you mind filling in a few blanks?"
    )
    XCTAssertEqual(
      Set(analysis.missingFields),
      Set(["monthly rent", "bedrooms", "bathrooms"])
    )
  }

  func testListingIntelligenceAllowsMissingUnitAndFindsPositiveAmenities() async {
    let analysis = await HomeboardListingIntelligence.analyze(message: [
      "listingScope": "unit",
      "address": "123 Main Street",
      "price": 3_200,
      "bedrooms": 2,
      "bathrooms": 1,
      "pageEvidence": """
        123 Main Street
        $3,200 per month · 2 beds · 1 bath
        Pet friendly with free laundry and a dishwasher.
        """
    ], allowSystemModel: false)

    XCTAssertTrue(analysis.missingFields.isEmpty)
    XCTAssertNil(analysis.facts.unit)
    XCTAssertEqual(
      Set(analysis.facts.amenities),
      Set(["pet friendly", "free laundry", "dishwasher"])
    )
  }

  func testListingIntelligenceDoesNotPromoteNegatedAmenities() async {
    let analysis = await HomeboardListingIntelligence.analyze(message: [
      "pageEvidence": "No pets allowed. No dishwasher. Paid laundry is available."
    ], allowSystemModel: false)

    XCTAssertFalse(analysis.facts.amenities.contains("pet friendly"))
    XCTAssertFalse(analysis.facts.amenities.contains("dishwasher"))
    XCTAssertFalse(analysis.facts.amenities.contains("free laundry"))
  }

  func testMissingCoreFieldsTriggerOneSecondaryScan() async {
    let result = await HomeboardListingIntelligence.analyzeWithOneRescan(
      message: [
        "address": "219 Kent Avenue",
        "city": "Brooklyn",
        "region": "NY",
        "postalCode": "11249",
        "secondaryPageEvidence": "$4,800 per month · 3 bd · 2 ba"
      ],
      allowSystemModel: false
    )

    XCTAssertTrue(result.performedRescan)
    XCTAssertEqual(
      Set(result.initialMissingFields),
      Set(["monthly rent", "bedrooms", "bathrooms"])
    )
    XCTAssertTrue(result.analysis.missingFields.isEmpty)
    XCTAssertEqual(result.analysis.facts.price, 4_800)
    XCTAssertEqual(result.analysis.facts.bedrooms, 3)
    XCTAssertEqual(result.analysis.facts.bathrooms, 2)
  }

  func testSecondaryScanReportsFieldsThatRemainMissing() async {
    let result = await HomeboardListingIntelligence.analyzeWithOneRescan(
      message: [
        "address": "219 Kent Avenue",
        "price": 4_800,
        "bedrooms": 3,
        "secondaryPageEvidence": "Monthly rent $4,800. Three bedrooms."
      ],
      allowSystemModel: false
    )

    XCTAssertTrue(result.performedRescan)
    XCTAssertEqual(result.initialMissingFields, ["bathrooms"])
    XCTAssertEqual(result.analysis.missingFields, ["bathrooms"])
    XCTAssertEqual(
      result.analysis.message,
      "Homeboard took a second look. Still missing: bathrooms."
    )
  }

  func testCompleteFirstScanSkipsSecondaryScan() async {
    let result = await HomeboardListingIntelligence.analyzeWithOneRescan(
      message: [
        "address": "219 Kent Avenue",
        "price": 4_800,
        "bedrooms": 3,
        "bathrooms": 2,
        "secondaryPageEvidence": "This should not be needed."
      ],
      allowSystemModel: false
    )

    XCTAssertFalse(result.performedRescan)
    XCTAssertTrue(result.initialMissingFields.isEmpty)
    XCTAssertTrue(result.analysis.missingFields.isEmpty)
  }

  func testCompleteShareTriggeredImportSavesWithoutReview() {
    let pending = HomeboardSharedImportStore.PendingImport(
      url: "https://example.com/listing/3b",
      address: "219 Kent Avenue, Brooklyn, NY 11249",
      price: 4_800,
      bedrooms: 3,
      bathrooms: 2,
      extractionConfidence: "needs-review"
    )

    XCTAssertFalse(pending.requiresReview)
  }

  @MainActor
  func testRemoveListingUsesServerBoardWhenLocalOverlayIsEmpty() {
    let previousState = isolateAppModelPersistence()
    defer { restoreAppModelPersistence(previousState) }

    let listing = ListingPreview(
      id: "board-listing-1",
      listingId: "listing-1",
      title: "625 West 57th Street",
      location: "New York, NY 10019",
      priceLine: "$4,800",
      commuteLine: "Compare routes",
      summary: "Sample",
      fitLabel: "Shortlisted",
      highlights: [],
      openRisks: []
    )
    let model = AppModel()
    model.authSession = nil
    model.board = .empty
    model.board.id = "board-removal-test"
    model.board.shortlist = [listing]
    model.localShortlistsByBoard["board-removal-test"] = []

    model.removeManualListing(id: listing.id)

    XCTAssertTrue(model.board.shortlist.isEmpty)
    XCTAssertEqual(model.boardFeedback, "Listing moved to Recently Deleted.")
    XCTAssertNil(model.boardError)
  }

  @MainActor
  func testLocalListingInsertionAndDeletionSurviveRelaunch() {
    let previousState = isolateAppModelPersistence()
    defer { restoreAppModelPersistence(previousState) }

    let model = AppModel()
    model.authSession = nil
    model.board = .empty
    model.board.id = "local-persistence-test"
    model.addManualListing(
      title: "1 Meadowlands Parkway, Secaucus, NJ 07094",
      location: "Secaucus, NJ 07094",
      priceLine: "$2,750 / month",
      commuteLine: "Compare routes",
      summary: "Saved from Safari",
      fitLabel: "New",
      sourceURL: "https://www.zillow.com/example",
      unit: "4B",
      bedrooms: "2",
      bathrooms: "2"
    )

    let restoredAfterInsert = AppModel()
    XCTAssertEqual(restoredAfterInsert.board.shortlist.count, 1)
    XCTAssertEqual(restoredAfterInsert.board.shortlist.first?.unit, "4B")

    model.addManualListing(
      title: "1 Meadowlands Parkway, Secaucus, NJ 07094",
      location: "Secaucus, NJ 07094",
      priceLine: "$2,750 / month",
      commuteLine: "Compare routes",
      summary: "Duplicate",
      fitLabel: "New",
      sourceURL: "https://www.zillow.com/example",
      unit: "4B",
      bedrooms: "2",
      bathrooms: "2"
    )
    XCTAssertEqual(model.board.shortlist.count, 1)

    let listingID = try? XCTUnwrap(model.board.shortlist.first?.id)
    if let listingID { model.removeManualListing(id: listingID) }
    let restoredAfterDelete = AppModel()
    XCTAssertTrue(restoredAfterDelete.board.shortlist.isEmpty)
  }

  @MainActor
  func testAppModelInitWithExistingLocalBoardsDoesNotTriggerExclusivityViolation() {
    let previousState = isolateAppModelPersistence()
    defer { restoreAppModelPersistence(previousState) }

    let model = AppModel()
    var sampleBoard = MobileBoard.empty
    sampleBoard.id = "local-exclusivity-test"
    sampleBoard.recentlyDeleted = [
      ListingPreview(
        id: "del-1",
        title: "Deleted Listing",
        location: "NYC",
        priceLine: "$2,000",
        commuteLine: "15 min",
        summary: "test",
        fitLabel: "test",
        highlights: [],
        openRisks: [],
        deletedAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(-10 * 24 * 60 * 60))
      )
    ]
    model.localBoardsById["local-exclusivity-test"] = sampleBoard
    model.persist()

    let reinitialized = AppModel()
    XCTAssertNotNil(reinitialized.localBoardsById["local-exclusivity-test"])
    XCTAssertTrue(reinitialized.localBoardsById["local-exclusivity-test"]?.recentlyDeleted?.isEmpty ?? false)
  }

  private func isolateAppModelPersistence() -> [(key: String, data: Data?)] {
    let defaults = UserDefaults.standard
    let previousState = appModelPersistenceKeys.map { key in
      (key: key, data: defaults.data(forKey: key))
    }
    appModelPersistenceKeys.forEach(defaults.removeObject(forKey:))
    return previousState
  }

  private func restoreAppModelPersistence(_ previousState: [(key: String, data: Data?)]) {
    let defaults = UserDefaults.standard
    for record in previousState {
      if let data = record.data {
        defaults.set(data, forKey: record.key)
      } else {
        defaults.removeObject(forKey: record.key)
      }
    }
  }

  func testSharedListingActiveOfferDetectionAndScaling() {
    // 1 month free
    let offer1 = SharedListingActiveOffer.detect(
      highlights: ["1 month free on 12-month lease"],
      summary: "",
      fitLabel: "",
      priceLine: "$3,000",
      amenities: [],
      title: "Nice apartment"
    )
    XCTAssertNotNil(offer1)
    XCTAssertEqual(offer1?.bonusPoints, 10)
    XCTAssertEqual(offer1?.title, "1 Month Free Special")
    XCTAssertEqual(offer1?.badgeLabel, "1 Mo Free")

    // 2 months free
    let offer2 = SharedListingActiveOffer.detect(
      highlights: [],
      summary: "Move in now and receive 2 months free concession",
      fitLabel: "",
      priceLine: "$4,000",
      amenities: [],
      title: "Modern 2BR"
    )
    XCTAssertNotNil(offer2)
    XCTAssertEqual(offer2?.bonusPoints, 18)
    XCTAssertEqual(offer2?.title, "2 Months Free Special")

    // No broker fee
    let offerNoFee = SharedListingActiveOffer.detect(
      highlights: [],
      summary: "",
      fitLabel: "",
      priceLine: "$2,800",
      amenities: ["No broker fee", "Elevator"],
      title: "Spacious studio"
    )
    XCTAssertNotNil(offerNoFee)
    XCTAssertEqual(offerNoFee?.bonusPoints, 8)
    XCTAssertEqual(offerNoFee?.title, "No Broker Fee")

    // Cash credit $1500
    let offerCredit = SharedListingActiveOffer.detect(
      highlights: ["$1,500 move-in bonus for immediate move-ins"],
      summary: "",
      fitLabel: "",
      priceLine: "$3,500",
      amenities: [],
      title: "Luxury unit"
    )
    XCTAssertNotNil(offerCredit)
    XCTAssertEqual(offerCredit?.bonusPoints, 8)

    // Waived deposit
    let offerDeposit = SharedListingActiveOffer.detect(
      highlights: [],
      summary: "Zero deposit required on approved credit",
      fitLabel: "",
      priceLine: "$2,500",
      amenities: [],
      title: "Cozy 1BR"
    )
    XCTAssertNotNil(offerDeposit)
    XCTAssertEqual(offerDeposit?.bonusPoints, 5)

    // Stacking: 1 month free + no broker fee -> 10 + 8 = 18 pts
    let offerStacked = SharedListingActiveOffer.detect(
      highlights: ["1 month free", "No fee"],
      summary: "",
      fitLabel: "",
      priceLine: "$3,200",
      amenities: [],
      title: "Great deal"
    )
    XCTAssertNotNil(offerStacked)
    XCTAssertEqual(offerStacked?.bonusPoints, 18)
    XCTAssertEqual(offerStacked?.title, "1 Month Free + No Broker Fee")

    // Cap at 25 points maximum
    let offerCapped = SharedListingActiveOffer.detect(
      highlights: ["3 months free", "No broker fee", "$2,000 move-in credit"],
      summary: "",
      fitLabel: "",
      priceLine: "$5,000",
      amenities: [],
      title: "Penthouse"
    )
    XCTAssertNotNil(offerCapped)
    XCTAssertEqual(offerCapped?.bonusPoints, 25)
  }

  func testSharedComparisonMathOfferBonusAndPriceAdjustment() {
    let offer = SharedListingActiveOffer(kinds: [.monthsFree(count: 1.0)], rawEvidence: "1 month free")
    let bonus = SharedComparisonMath.offerBonusPoints(for: offer)
    XCTAssertEqual(bonus, 10)

    // Base score 75 boosted by 10 points -> 85
    let adjusted = SharedComparisonMath.adjustedPriceScore(baseScore: 75, bonusPoints: bonus)
    XCTAssertEqual(adjusted, 85)

    // Score clamped at 100
    let clamped = SharedComparisonMath.adjustedPriceScore(baseScore: 96, bonusPoints: bonus)
    XCTAssertEqual(clamped, 100)
  }

  func testListingPreviewActiveOfferIntegration() {
    let listing = ListingPreview(
      id: "test-offer",
      title: "Offer listing",
      location: "New York",
      priceLine: "$3,000",
      commuteLine: "20 min",
      summary: "Sample summary",
      fitLabel: "Great fit",
      highlights: ["1 month free on 12-month lease"],
      openRisks: []
    )
    XCTAssertNotNil(listing.activeOffer)
    XCTAssertEqual(listing.activeOffer?.bonusPoints, 10)
    XCTAssertEqual(listing.activeOffer?.badgeLabel, "1 Mo Free")
  }

}
