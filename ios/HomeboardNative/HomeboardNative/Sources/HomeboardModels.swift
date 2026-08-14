import Foundation

struct LocalAccount: Hashable, Codable {
  var id: String? = nil
  var name: String
  var email: String
}

struct NativeAuthSession: Hashable, Codable {
  var accessToken: String
  var refreshToken: String
  var userId: String
  var email: String
  var displayName: String
}

struct MacDevicePairingRequest: Identifiable, Hashable {
  var id: String
  var approvalCode: String
  var deviceName: String

  init?(url: URL) {
    guard url.scheme?.lowercased() == "homeboard",
          url.host?.lowercased() == "connect-mac",
          let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    else { return nil }
    let values = Dictionary(
      uniqueKeysWithValues: (components.queryItems ?? []).map { ($0.name, $0.value ?? "") }
    )
    guard let id = values["id"]?.trimmingCharacters(in: .whitespacesAndNewlines),
          !id.isEmpty,
          let code = values["code"],
          code.range(of: #"^\d{6}$"#, options: .regularExpression) != nil
    else { return nil }
    self.id = id
    self.approvalCode = code
    let name = values["device"]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    self.deviceName = name.isEmpty ? "Mac" : String(name.prefix(100))
  }

  init?(payload: String) {
    guard let url = URL(string: payload.trimmingCharacters(in: .whitespacesAndNewlines)) else {
      return nil
    }
    self.init(url: url)
  }

  var formattedCode: String {
    guard approvalCode.count == 6 else { return approvalCode }
    let middle = approvalCode.index(approvalCode.startIndex, offsetBy: 3)
    return "\(approvalCode[..<middle]) \(approvalCode[middle...])"
  }
}

struct MobileBoardSummary: Identifiable, Hashable, Codable {
  var id: String
  var title: String
  var city: String
  var createdAt: String
  var updatedAt: String
}

struct BoardInvitationSummary: Identifiable, Hashable, Codable {
  var id: String
  var email: String?
  var inviteCode: String
  var status: String
  var expiresAt: String?
}

struct RentalReadiness: Hashable, Codable {
  var hasOfferLetter: Bool
  var needsGuarantor: Bool
  var hasProofOfIncome: Bool
  var notes: String = ""

  init(
    hasOfferLetter: Bool,
    needsGuarantor: Bool,
    hasProofOfIncome: Bool,
    notes: String = ""
  ) {
    self.hasOfferLetter = hasOfferLetter
    self.needsGuarantor = needsGuarantor
    self.hasProofOfIncome = hasProofOfIncome
    self.notes = notes
  }

  private enum CodingKeys: String, CodingKey {
    case hasOfferLetter
    case needsGuarantor
    case hasProofOfIncome
    case notes
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    hasOfferLetter = try container.decodeIfPresent(Bool.self, forKey: .hasOfferLetter) ?? false
    needsGuarantor = try container.decodeIfPresent(Bool.self, forKey: .needsGuarantor) ?? false
    hasProofOfIncome = try container.decodeIfPresent(Bool.self, forKey: .hasProofOfIncome) ?? false
    notes = try container.decodeIfPresent(String.self, forKey: .notes) ?? ""
  }
}

struct OnboardingChatMessage: Identifiable, Hashable, Codable {
  var id = UUID()
  var role: Role
  var content: String

  enum Role: String, Hashable, Codable {
    case user
    case assistant
  }
}

struct RentalProfile: Hashable, Codable {
  var name: String = ""
  var city: String = ""
  var moveInDate: String = ""
  var groupSize: Int = 1
  var budgetMin: String = ""
  var budgetMax: String = ""
  var commuteTarget: String = ""
  var commuteAccess: String? = nil
  var minCommuteMinutes: String = ""
  var maxCommuteMinutes: String = ""
  var neighborhoods: [String] = []
  var mustHaves: [String] = []
  var dealbreakers: [String] = []
  var priorities: [String] = []
  var readiness: RentalReadiness = .init(
    hasOfferLetter: false,
    needsGuarantor: false,
    hasProofOfIncome: false
  )

  var completionRatio: Double {
    Double(completedFieldCount) / Double(requiredFieldCount)
  }

  var percentComplete: Int {
    Int((completionRatio * 100).rounded())
  }

  var missingFields: [String] {
    var missing: [String] = []
    if name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { missing.append("Name") }
    if city.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { missing.append("City") }
    if moveInDate.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { missing.append("Move-in") }
    if budgetMax.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { missing.append("Budget") }
    let skipsCommute = commuteAccess == "remote" || commuteAccess == "skip"
    if !skipsCommute {
      let hasTarget = !commuteTarget.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      let minimum = Int(minCommuteMinutes)
      let maximum = Int(maxCommuteMinutes)
      if !hasTarget || minimum == nil || maximum == nil || minimum! >= maximum! {
        missing.append("Commute")
      }
    }
    if mustHaves.isEmpty { missing.append("Must-haves") }
    if dealbreakers.isEmpty { missing.append("Dealbreakers") }
    if priorities.isEmpty { missing.append("Priorities") }
    return missing
  }

  var isBoardReady: Bool {
    missingFields.isEmpty
  }

  private var completedFieldCount: Int {
    requiredFieldCount - missingFields.count
  }

  private var requiredFieldCount: Int {
    8
  }
}

struct MemberPreferenceCard: Identifiable, Hashable, Codable {
  var id: String = UUID().uuidString
  var userId: String = ""
  var roommateId: String? = nil
  var role: String = "member"
  var name: String
  var budgetMin: Double? = nil
  var idealBudget: Double? = nil
  var budgetMax: Double? = nil
  var stretchBudget: Double? = nil
  var budgetLine: String
  var commuteDestination: String? = nil
  var commuteAccess: String? = nil
  var preferredCommuteMinutes: Int? = nil
  var maxCommuteMinutes: Int? = nil
  var commuteLine: String
  var priorities: [String]
  var mustHaves: [String]? = nil
  var dealbreakers: [String]
  var petsRequired: Bool? = nil
  var accessibilityNeeds: [String]? = nil
  var neighborhoods: [String]
  var status: String
}

struct ListingSourceLink: Identifiable, Hashable, Codable {
  var id: String
  var catalogSourceId: String?
  var label: String
  var url: String
  var kind: String
  var confirmedAt: String?
  var confirmedBy: String?
  var trustStatus: String?
  var warning: String?
  var confirmationCount: Int?
  var boardCount: Int?
  var reportCount: Int?
  var globallyDiscoverable: Bool?
}

struct GeneratedListingSearchLink: Identifiable, Hashable, Codable {
  var id: String { "\(provider)-\(url)" }
  var label: String
  var url: String
  var provider: String
}

struct ListingVerificationSummary: Hashable, Codable {
  var status: String
  var confirmedBy: String?
  var confirmedAt: String?
  var note: String?

  static let unverified = ListingVerificationSummary(
    status: "unverified",
    confirmedBy: nil,
    confirmedAt: nil,
    note: nil
  )
}

struct ListingFreshnessSummary: Hashable, Codable {
  var providerLastSeenAt: String?
  var providerFetchedAt: String?
  var exactSourceConfirmedAt: String?
}

struct ListingQuickReview: Identifiable, Hashable, Codable {
  var id: String
  var memberId: String
  var userId: String
  var name: String
  var tourIntent: String
  var interiorAppeal: Int?
  var naturalLight: String
  var mainConcern: String?
  var updatedAt: String
}

struct ListingDecisionVote: Hashable, Codable {
  var name: String
  var choice: String
}

struct ListingDecisionSummary: Identifiable, Hashable, Codable {
  var id: String
  var type: String
  var closedAt: String?
  var votes: [ListingDecisionVote]
}

struct ListingDimensionAnalysis: Hashable, Codable {
  var score: Double?
  var explanation: String
  var known: Bool
}

struct RoommateListingAnalysis: Identifiable, Hashable, Codable {
  var id: String { roommateId }
  var roommateId: String
  var name: String
  var overallScore: Double?
  var dimensions: [String: ListingDimensionAnalysis]
  var hardFailures: [String]
  var unknownConstraints: [String]
  var explanation: String
}

struct GroupListingAnalysis: Hashable, Codable {
  var overallScore: Double?
  var lowestRoommateScore: Double?
  var disagreement: Double?
  var fairnessScore: Double?
  var hardFailureCount: Int
  var rankingLabel: String
  var verdict: String
  var confidence: String
  var confidenceReason: String
  var nextActions: [String]
  var members: [RoommateListingAnalysis]
}

struct ListingPreview: Identifiable, Hashable, Codable {
  var id: String
  var listingId: String
  var title: String
  var address: String = ""
  var location: String
  var priceLine: String
  var commuteLine: String
  var summary: String
  var fitLabel: String
  var highlights: [String]
  var amenities: [String] = []
  var modelInsights: [HomeboardListingInsight] = []
  var openRisks: [String]
  var status: String = "saved"
  var workflowStatus: String = "suggested"
  var sourceURL: String = ""
  var exactSources: [ListingSourceLink] = []
  var generatedSearches: [GeneratedListingSearchLink] = []
  var verification: ListingVerificationSummary = .unverified
  var freshness: ListingFreshnessSummary = ListingFreshnessSummary()
  var groupNote: String = ""
  var photoURL: String = ""
  var unit: String = ""
  var bedrooms: String = ""
  var bathrooms: String = ""
  var squareFeet: Int? = nil
  var latitude: Double? = nil
  var longitude: Double? = nil
  var reactions: [ListingReaction] = []
  var comments: [ListingComment] = []
  var ratings: [ListingDimensionRating] = []
  var reviews: [ListingQuickReview] = []
  var decisions: [ListingDecisionSummary] = []
  var analysis: GroupListingAnalysis? = nil
  var rentSplit: RentSplitPreview? = nil

  init(
    id: String = UUID().uuidString,
    listingId: String = "",
    title: String,
    address: String = "",
    location: String,
    priceLine: String,
    commuteLine: String,
    summary: String,
    fitLabel: String,
    highlights: [String],
    amenities: [String] = [],
    modelInsights: [HomeboardListingInsight] = [],
    openRisks: [String],
    status: String = "saved",
    sourceURL: String = "",
    groupNote: String = "",
    photoURL: String = "",
    unit: String = "",
    bedrooms: String = "",
    bathrooms: String = "",
    squareFeet: Int? = nil,
    latitude: Double? = nil,
    longitude: Double? = nil
  ) {
    self.id = id
    self.listingId = listingId
    self.title = title
    self.address = address
    self.location = location
    self.priceLine = priceLine
    self.commuteLine = commuteLine
    self.summary = summary
    self.fitLabel = fitLabel
    self.highlights = highlights
    self.amenities = amenities
    self.modelInsights = modelInsights
    self.openRisks = openRisks
    self.status = status
    self.sourceURL = sourceURL
    self.groupNote = groupNote
    self.photoURL = photoURL
    self.unit = unit
    self.bedrooms = bedrooms
    self.bathrooms = bathrooms
    self.squareFeet = squareFeet
    self.latitude = latitude
    self.longitude = longitude
  }

  private enum CodingKeys: String, CodingKey {
    case id
    case listingId
    case title
    case address
    case location
    case priceLine
    case commuteLine
    case summary
    case fitLabel
    case highlights
    case amenities
    case modelInsights
    case openRisks
    case status
    case workflowStatus
    case sourceURL = "sourceUrl"
    case exactSources
    case generatedSearches
    case verification
    case freshness
    case groupNote
    case photoURL = "photoUrl"
    case unit
    case bedrooms
    case bathrooms
    case squareFeet
    case latitude
    case longitude
    case reactions
    case comments
    case ratings
    case reviews
    case decisions
    case analysis
    case rentSplit
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    id = try container.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
    listingId = try container.decodeIfPresent(String.self, forKey: .listingId) ?? ""
    title = try container.decodeIfPresent(String.self, forKey: .title) ?? "Untitled listing"
    address = try container.decodeIfPresent(String.self, forKey: .address) ?? ""
    location = try container.decodeIfPresent(String.self, forKey: .location) ?? "Location still being verified"
    priceLine = try container.decodeIfPresent(String.self, forKey: .priceLine) ?? "Price still being verified"
    commuteLine = try container.decodeIfPresent(String.self, forKey: .commuteLine) ?? "Commute still being verified"
    summary = try container.decodeIfPresent(String.self, forKey: .summary) ?? "The group still needs to review this listing."
    fitLabel = try container.decodeIfPresent(String.self, forKey: .fitLabel) ?? "Board pick"
    highlights = try container.decodeIfPresent([String].self, forKey: .highlights) ?? []
    amenities = try container.decodeIfPresent([String].self, forKey: .amenities) ?? []
    modelInsights = try container.decodeIfPresent([HomeboardListingInsight].self, forKey: .modelInsights) ?? []
    openRisks = try container.decodeIfPresent([String].self, forKey: .openRisks) ?? []
    status = try container.decodeIfPresent(String.self, forKey: .status) ?? "saved"
    workflowStatus = try container.decodeIfPresent(String.self, forKey: .workflowStatus) ?? "suggested"
    sourceURL = try container.decodeIfPresent(String.self, forKey: .sourceURL) ?? ""
    exactSources = try container.decodeIfPresent([ListingSourceLink].self, forKey: .exactSources) ?? []
    generatedSearches = try container.decodeIfPresent([GeneratedListingSearchLink].self, forKey: .generatedSearches) ?? []
    verification = try container.decodeIfPresent(ListingVerificationSummary.self, forKey: .verification) ?? .unverified
    freshness = try container.decodeIfPresent(ListingFreshnessSummary.self, forKey: .freshness) ?? ListingFreshnessSummary()
    groupNote = try container.decodeIfPresent(String.self, forKey: .groupNote) ?? ""
    photoURL = try container.decodeIfPresent(String.self, forKey: .photoURL) ?? ""
    unit = try container.decodeIfPresent(String.self, forKey: .unit) ?? ""
    bedrooms = try container.decodeIfPresent(String.self, forKey: .bedrooms) ?? ""
    bathrooms = try container.decodeIfPresent(String.self, forKey: .bathrooms) ?? ""
    squareFeet = try container.decodeIfPresent(Int.self, forKey: .squareFeet)
    latitude = try container.decodeIfPresent(Double.self, forKey: .latitude)
    longitude = try container.decodeIfPresent(Double.self, forKey: .longitude)
    reactions = try container.decodeIfPresent([ListingReaction].self, forKey: .reactions) ?? []
    comments = try container.decodeIfPresent([ListingComment].self, forKey: .comments) ?? []
    ratings = try container.decodeIfPresent([ListingDimensionRating].self, forKey: .ratings) ?? []
    reviews = try container.decodeIfPresent([ListingQuickReview].self, forKey: .reviews) ?? []
    decisions = try container.decodeIfPresent([ListingDecisionSummary].self, forKey: .decisions) ?? []
    analysis = try container.decodeIfPresent(GroupListingAnalysis.self, forKey: .analysis)
    rentSplit = try container.decodeIfPresent(RentSplitPreview.self, forKey: .rentSplit)
  }
}

struct MobileListingRanking: Identifiable, Hashable, Codable {
  var id: String { boardListingId }
  var boardListingId: String
  var listingId: String
  var position: Int
  var label: String
  var verdict: String
  var overallScore: Double?
  var lowestRoommateScore: Double?
  var fairnessScore: Double?
  var confidence: String
}

struct RentSharePreview: Identifiable, Hashable, Codable {
  var id: String { memberId }
  var memberId: String
  var name: String
  var amount: Int
  var percentOfRent: Int
  var percentOfComfortableBudget: Int
  var comfortableBudget: Int
}

struct RentSplitPreview: Hashable, Codable {
  var status: String
  var summary: String
  var totalComfortableBudget: Int?
  var totalStretchBudget: Int?
  var missingMemberNames: [String]
  var shares: [RentSharePreview]
}

struct ListingReaction: Identifiable, Hashable, Codable {
  var id: String { "\(name)-\(vote)" }
  var name: String
  var vote: String
  var note: String?
}

struct ListingComment: Identifiable, Hashable, Codable {
  var id: String
  var name: String
  var content: String
  var createdAt: String
}

struct ListingDimensionRating: Identifiable, Hashable, Codable {
  var id: String
  var memberId: String
  var userId: String
  var name: String
  var values: [String: Int]
  var updatedAt: String
}

struct BoardMessage: Identifiable, Hashable, Codable {
  var id: String
  var role: String
  var authorName: String?
  var content: String
  var createdAt: String
}

struct MobileBoard: Hashable, Codable {
  var id: String? = nil
  var title: String
  var city: String
  var moveInTimeline: String
  var groupSize: String
  var budgetLine: String
  var commuteTargets: [String]
  var readiness: String
  var completionLine: String
  var nextBestAction: String
  var inviteCode: String
  var recentActivity: [String]
  var chatMessages: [BoardMessage]
  var openQuestions: [String]
  var members: [MemberPreferenceCard]
  var suggestions: [ListingPreview]? = nil
  var shortlist: [ListingPreview]
  var invitations: [BoardInvitationSummary]
  var ranking: [MobileListingRanking]? = nil
}

extension MobileBoard {
  static let empty = MobileBoard(
    id: nil,
    title: "New homeboard",
    city: "",
    moveInTimeline: "",
    groupSize: "",
    budgetLine: "Budget still open",
    commuteTargets: [],
    readiness: "Profile still in progress",
    completionLine: "Start by creating an account and defining the shared rental brief.",
    nextBestAction: "Create an account, finish the onboarding brief, and start turning the search into a real shared board.",
    inviteCode: "",
    recentActivity: [],
    chatMessages: [],
    openQuestions: [],
    members: [],
    suggestions: [],
    shortlist: [],
    invitations: []
  )
}
