export type PriorityLevel = "low" | "medium" | "high";
export type CommuteAccess = "car" | "transit" | "flexible" | "remote" | "skip";

export type RentalReadiness = {
  hasOfferLetter?: boolean;
  needsGuarantor?: boolean;
  hasProofOfIncome?: boolean;
};

export type ProfileCompletion = {
  completedFields: string[];
  missingFields: string[];
  percentComplete: number;
};

export type AuthUserRecord = {
  id: string;
  authUserId: string;
  email: string;
  displayName: string;
  workAddress: string | null;
  secondaryWorkAddress: string | null;
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
  authProviders: string[];
  createdAt: string;
  updatedAt: string;
};

export type RentalProfile = {
  id: string;
  boardId: string;
  name: string;
  email?: string;
  city?: string;
  moveInDate?: string;
  budgetMin?: number;
  budgetMax?: number;
  stretchBudget?: number;
  neighborhoods: string[];
  commuteTarget?: string;
  commuteAccess?: CommuteAccess;
  minCommuteMinutes?: number;
  maxCommuteMinutes?: number;
  mustHaves: string[];
  dealbreakers: string[];
  niceToHaves: string[];
  priorities: string[];
  pets?: boolean;
  parking?: boolean;
  groupSize?: number;
  hasRoommates?: boolean;
  rentalReadiness?: RentalReadiness;
  completionStatus: "incomplete" | "complete" | "confirmed";
  notes?: string | null;
  createdAt: string;
  updatedAt: string

  intent?: "rent" | "buy" | null;
  propertyType?: "apartment" | "house" | "condo" | "room" | "unknown" | null;
  locations: string[];
  bedroomsPreferred?: number | null;
  bedroomsFlexible: string[];
  moveInTimeframe?: string | null;
  petsRequired?: boolean | null;
  parkingRequired?: boolean | null;
  laundryRequired?: boolean | null;
};

export type SearchProfileData = RentalProfile;

export type ChatMessage = {
  id: string;
  boardId: string;
  role: "user" | "assistant" | "system";
  authorUserId: string | null;
  authorName: string | null;
  content: string;
  createdAt: string;
};

export type BoardMember = {
  id: string;
  boardId: string;
  userId: string;
  role: "owner" | "member";
  joinedAt: string;
  createdAt: string;
  user: Pick<AuthUserRecord, "id" | "email" | "displayName" | "workAddress" | "secondaryWorkAddress">;
};

export type BoardMemberRecord = BoardMember;

export type GroupProfile = {
  groupBudgetMin?: number | null;
  groupBudgetMax: number | null;
  groupStretchBudget?: number | null;
  budgetMemberCount?: number;
  missingBudgetMemberNames?: string[];
  budgetRangeText?: string;
  budgetOverlapStatus?: "strong" | "mixed" | "weak";
  commuteDestinations: string[];
  commuteAlignment?: "aligned" | "mixed" | "split";
  preferredNeighborhoods: string[];
  neighborhoodAlignment?: "aligned" | "mixed" | "split";
  mustHaves: string[];
  dealbreakers: string[];
  topSharedPriorities: string[];
  compromiseAreas: string[];
  tensionFlags: string[];
  confidenceLabel?: "high" | "medium" | "low";
  confidenceReason?: string;
  summary: string;
};

export type GroupSynthesis = GroupProfile;

export type BoardInvite = {
  id: string;
  boardId: string;
  invitedByUserId: string;
  email: string | null;
  inviteCode: string;
  status: "pending" | "accepted" | "revoked";
  createdAt: string;
  acceptedAt: string | null;
  expiresAt: string | null;
};

export type BoardInvitationRecord = BoardInvite;

export type RentalBoard = {
  id: string;
  userId: string;
  title: string;
  name: string;
  city?: string;
  createdByProfileId: string;
  members: BoardMember[];
  listings: Listing[];
  groupProfile?: GroupProfile;
  createdAt: string;
  updatedAt: string;
};

export type SearchBoardSummary = Pick<RentalBoard, "id" | "userId" | "title" | "name" | "city" | "createdAt" | "updatedAt">;

export type RoommateRecord = {
  id: string;
  boardId: string;
  linkedUserId?: string | null;
  name: string;
  roleLabel: string;
  budgetMin: number | null;
  idealBudget: number | null;
  budgetMax: number | null;
  stretchBudget: number | null;
  commuteDestination: string | null;
  commuteAccess?: CommuteAccess | null;
  preferredCommuteMinutes: number | null;
  maxCommuteMinutes: number | null;
  commutePriority: PriorityLevel;
  neighborhoodPriority: PriorityLevel;
  spacePriority: PriorityLevel;
  privacyPriority: PriorityLevel;
  preferredNeighborhoods: string[];
  mustHaves: string[];
  dealbreakers: string[];
  petsRequired: boolean | null;
  accessibilityNeeds: string[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ListingModelInsight = {
  category: "amenity" | "interior" | "space" | "layout" | "storage" | "light" | "noise" | "transit" | "neighborhood" | "building" | "outdoor" | "fee" | "risk";
  label: string;
  sentiment: number;
  confidence: number;
  evidence: string;
};

export type Listing = {
  id: string;
  source: "manual" | "pasted_link" | "pasted_text" | "api";
  sourceName: string | null;
  sourceUrl: string | null;
  externalId: string | null;
  address: string | null;
  unit: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  neighborhood: string | null;
  latitude: number | null;
  longitude: number | null;
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFeet: number | null;
  availableDate: string | null;
  propertyType: string | null;
  amenities: string[];
  fees: Record<string, unknown>;
  description: string | null;
  images: string[];
  providerData: Record<string, unknown>;
  providerStatus: string | null;
  providerListedAt: string | null;
  providerLastSeenAt: string | null;
  providerFetchedAt: string | null;
  status: "active" | "unknown" | "removed" | "rented" | "saved_only";
  createdAt: string;
  updatedAt: string;
};

export type ListingRecord = Listing;

export type BoardListingRecord = {
  id: string;
  boardId: string;
  listingId: string;
  userStatus: "new" | "interested" | "maybe" | "rejected" | "toured" | "applied";
  workflowStatus: ListingWorkflowStatus;
  userNotes: string | null;
  aiSummary: string | null;
  aiTradeoffAnalysis: string | null;
  aiRedFlags: string[];
  questionsToAsk: string[];
  createdAt: string;
  updatedAt: string;
  listing: ListingRecord;
};

export type ListingWorkflowStatus =
  | "suggested"
  | "source_confirmed"
  | "considering"
  | "shortlisted"
  | "viewing"
  | "applying"
  | "decided";

export type ListingVerificationStatus =
  | "unverified"
  | "active"
  | "unavailable"
  | "possibly_stale"
  | "incorrect_match";

export type BoardListingSourceRecord = {
  id: string;
  boardListingId: string;
  catalogSourceId: string | null;
  url: string;
  label: string;
  kind: "imported_exact" | "confirmed_exact" | "member_reference";
  createdByRoommateId: string | null;
  confirmedAt: string | null;
  createdAt: string;
  createdByRoommate: Pick<RoommateRecord, "id" | "name"> | null;
  catalogSource: {
    id: string;
    trustStatus:
      | "board_only"
      | "pending_review"
      | "community_supported"
      | "verified"
      | "review_hold"
      | "rejected";
    resolutionStatus:
      | "unattempted"
      | "no_match"
      | "exact_match"
      | "ambiguous"
      | "failed";
    warning: string | null;
    boardCount: number;
    confirmationCount: number;
    reportCount: number;
    globallyDiscoverable: boolean;
  } | null;
};

export type BoardListingVerificationRecord = {
  id: string;
  boardListingId: string;
  roommateId: string | null;
  status: ListingVerificationStatus;
  note: string | null;
  createdAt: string;
  roommate: Pick<RoommateRecord, "id" | "name"> | null;
};

export type BoardListingReviewRecord = {
  id: string;
  boardListingId: string;
  roommateId: string;
  tourIntent: "yes" | "maybe" | "no";
  interiorAppeal: number | null;
  naturalLight: "unknown" | "poor" | "fair" | "good" | "excellent";
  mainConcern: string | null;
  sourceViewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  roommate: Pick<RoommateRecord, "id" | "name" | "linkedUserId">;
};

export type BoardListingDecisionRecord = {
  id: string;
  boardListingId: string;
  type: "shortlist" | "request_viewing" | "apply";
  createdByRoommateId: string;
  createdAt: string;
  closedAt: string | null;
  votes: Array<{
    id: string;
    roommateId: string;
    choice: "yes" | "no" | "abstain";
    createdAt: string;
    updatedAt: string;
    roommate: Pick<RoommateRecord, "id" | "name" | "linkedUserId">;
  }>;
};

export type ListingDimensionResult = {
  score: number | null;
  explanation: string;
  known: boolean;
};

export type RoommateListingFit = {
  roommateId: string;
  name: string;
  overallScore: number | null;
  dimensions: {
    price: ListingDimensionResult;
    commute: ListingDimensionResult;
    location: ListingDimensionResult;
    space: ListingDimensionResult;
    amenities: ListingDimensionResult;
  };
  hardFailures: string[];
  unknownConstraints: string[];
  explanation: string;
};

export type GroupListingAnalysis = {
  overallScore: number | null;
  lowestRoommateScore: number | null;
  disagreement: number | null;
  fairnessScore: number | null;
  hardFailureCount: number;
  rankingLabel: "best overall" | "best value" | "best commute balance" | "visually liked" | "needs review";
  verdict: string;
  confidence: "high" | "medium" | "low";
  confidenceReason: string;
  nextActions: string[];
  members: RoommateListingFit[];
};

export type SuggestedListingRecord = {
  listing: ListingRecord;
  existingBoardListingId: string | null;
  existingStatus: BoardListingRecord["userStatus"] | null;
  fitLabel: "best practical fit" | "worth a look" | "stretch option" | "risky but interesting";
  fitReason: string;
  tradeoffSummary: string;
  commute: {
    bestDurationMinutes: number | null;
    bestDistanceMiles: number | null;
    bestOriginLabel: string | null;
    evaluatedAnchors: string[];
  } | null;
  neighborhoodSignal: {
    tags: string[];
    summary: string;
  } | null;
  analysis?: GroupListingAnalysis;
};

export type BoardListingCommuteRecord = {
  boardListingId: string;
  bestDurationMinutes: number | null;
  bestDistanceMiles: number | null;
  bestOriginLabel: string | null;
  evaluatedAnchors: string[];
  routes: Array<{
    originLabel: string;
    durationMinutes: number | null;
    distanceMiles: number | null;
  }>;
};

export type ListingBrowseRequest = {
  count: number;
  hasExplicitCount: boolean;
  isMoreRequest: boolean;
  message: string;
  requestIndex: number;
};

export type BoardListingVoteRecord = {
  id: string;
  boardListingId: string;
  roommateId: string;
  vote: "love" | "like" | "maybe" | "pass" | "veto";
  note: string | null;
  createdAt: string;
  roommate: Pick<RoommateRecord, "id" | "name" | "roleLabel">;
};

export type BoardListingCommentRecord = {
  id: string;
  boardListingId: string;
  roommateId: string;
  content: string;
  createdAt: string;
  roommate: Pick<RoommateRecord, "id" | "name" | "roleLabel">;
};

export type BoardListingRatingRecord = {
  id: string;
  boardListingId: string;
  roommateId: string;
  ratings: Record<string, number>;
  createdAt: string;
  updatedAt: string;
  roommate: Pick<RoommateRecord, "id" | "name" | "roleLabel" | "linkedUserId">;
};

export type BoardActivityRecord = {
  id: string;
  boardId: string;
  actorType: "roommate" | "assistant" | "system";
  actorName: string;
  eventType: string;
  content: string;
  createdAt: string;
};

export type DemoScenario = {
  id: string;
  name: string;
  trigger: {
    locations: string[];
    locationAliases?: string[];
    propertyType?: SearchProfileData["propertyType"];
    bedroomsPreferred?: number;
    budgetMaxAtMost?: number;
    moveInContains?: string;
  };
  stagedReply: string;
  listingsReply: string;
  moreReply: string;
  comparisonReply: string;
  listingIds: string[];
  scriptedProfiles?: Array<{
    name: string;
    role: string;
    highlights: string[];
  }>;
};

export type BoardPageData = {
  isDemoMode: boolean;
  commuteMode: "demo" | "live" | "disabled";
  board: RentalBoard;
  profile: RentalProfile;
  roommates: RoommateRecord[];
  members: BoardMember[];
  invitations: BoardInvitationRecord[];
  groupSynthesis: GroupProfile;
  activity: BoardActivityRecord[];
  messages: ChatMessage[];
  boardListings: BoardListingRecord[];
  boardListingCommutesByBoardListingId: Record<string, BoardListingCommuteRecord>;
  listingVotesByBoardListingId: Record<string, BoardListingVoteRecord[]>;
  listingCommentsByBoardListingId: Record<string, BoardListingCommentRecord[]>;
  listingRatingsByBoardListingId: Record<string, BoardListingRatingRecord[]>;
  listingSourcesByBoardListingId: Record<string, BoardListingSourceRecord[]>;
  listingVerificationsByBoardListingId: Record<string, BoardListingVerificationRecord[]>;
  listingReviewsByBoardListingId: Record<string, BoardListingReviewRecord[]>;
  listingDecisionsByBoardListingId: Record<string, BoardListingDecisionRecord[]>;
  listingAnalysisByBoardListingId: Record<string, GroupListingAnalysis>;
  suggestedListings: SuggestedListingRecord[];
  currentDeckListings: SuggestedListingRecord[];
  currentBrowseRequest: ListingBrowseRequest | null;
  comparison: string;
  missingFields: string[];
  completion: ProfileCompletion;
};
