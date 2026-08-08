import XCTest
@testable import HomeboardNative

final class HomeboardNativeTests: XCTestCase {
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
      title: "Secaucus — Meadowlands apartments",
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

    XCTAssertFalse(plan.shouldRun)
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

  func testShareTriggeredImportWaitsForReviewEvenWhenFactsAreComplete() {
    let pending = HomeboardSharedImportStore.PendingImport(
      url: "https://example.com/listing/3b",
      address: "219 Kent Avenue, Brooklyn, NY 11249",
      price: 4_800,
      bedrooms: 3,
      bathrooms: 2,
      extractionConfidence: "needs-review"
    )

    XCTAssertTrue(pending.requiresReview)
  }

  @MainActor
  func testRemoveListingUsesServerBoardWhenLocalOverlayIsEmpty() {
    let persistenceKey = "homeboard.native.state"
    let previousState = UserDefaults.standard.data(forKey: persistenceKey)
    defer {
      if let previousState {
        UserDefaults.standard.set(previousState, forKey: persistenceKey)
      } else {
        UserDefaults.standard.removeObject(forKey: persistenceKey)
      }
    }
    UserDefaults.standard.removeObject(forKey: persistenceKey)

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
    XCTAssertEqual(model.boardFeedback, "Listing removed from the board.")
    XCTAssertNil(model.boardError)
  }

  @MainActor
  func testLocalListingInsertionAndDeletionSurviveRelaunch() {
    let persistenceKey = "homeboard.native.state"
    let previousState = UserDefaults.standard.data(forKey: persistenceKey)
    defer {
      if let previousState {
        UserDefaults.standard.set(previousState, forKey: persistenceKey)
      } else {
        UserDefaults.standard.removeObject(forKey: persistenceKey)
      }
    }
    UserDefaults.standard.removeObject(forKey: persistenceKey)

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
}
