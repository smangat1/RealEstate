export type PriorityLevel = "low" | "medium" | "high";

export type AuthUserRecord = {
  id: string;
  authUserId: string;
  email: string;
  displayName: string;
  workAddress: string | null;
  secondaryWorkAddress: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SearchProfileData = {
  id: string;
  boardId: string;
  intent: "rent" | "buy" | null;
  propertyType: "apartment" | "house" | "condo" | "room" | "unknown" | null;
  locations: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  bedroomsPreferred: number | null;
  bedroomsFlexible: string[];
  moveInTimeframe: string | null;
  mustHaves: string[];
  niceToHaves: string[];
  dealbreakers: string[];
  priorities: {
    price: PriorityLevel;
    space: PriorityLevel;
    commute: PriorityLevel;
    neighborhood: PriorityLevel;
    amenities: PriorityLevel;
  };
  petsRequired: boolean | null;
  parkingRequired: boolean | null;
  laundryRequired: boolean | null;
  commuteTarget: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  boardId: string;
  role: "user" | "assistant" | "system";
  authorUserId: string | null;
  authorName: string | null;
  content: string;
  createdAt: string;
};

export type RoommateRecord = {
  id: string;
  boardId: string;
  linkedUserId?: string | null;
  name: string;
  roleLabel: string;
  budgetMax: number | null;
  commuteDestination: string | null;
  commutePriority: PriorityLevel;
  neighborhoodPriority: PriorityLevel;
  spacePriority: PriorityLevel;
  privacyPriority: PriorityLevel;
  preferredNeighborhoods: string[];
  mustHaves: string[];
  dealbreakers: string[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ListingRecord = {
  id: string;
  source: "manual" | "pasted_link" | "pasted_text" | "api";
  sourceName: string | null;
  sourceUrl: string | null;
  externalId: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  neighborhood: string | null;
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
  status: "active" | "unknown" | "removed" | "rented" | "saved_only";
  createdAt: string;
  updatedAt: string;
};

export type BoardListingRecord = {
  id: string;
  boardId: string;
  listingId: string;
  userStatus: "new" | "interested" | "maybe" | "rejected" | "toured" | "applied";
  userNotes: string | null;
  aiSummary: string | null;
  aiTradeoffAnalysis: string | null;
  aiRedFlags: string[];
  questionsToAsk: string[];
  createdAt: string;
  updatedAt: string;
  listing: ListingRecord;
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
};

export type BoardListingCommuteRecord = {
  boardListingId: string;
  bestDurationMinutes: number | null;
  bestDistanceMiles: number | null;
  bestOriginLabel: string | null;
  evaluatedAnchors: string[];
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

export type BoardActivityRecord = {
  id: string;
  boardId: string;
  actorType: "roommate" | "assistant" | "system";
  actorName: string;
  eventType: string;
  content: string;
  createdAt: string;
};

export type GroupSynthesis = {
  groupBudgetMax: number | null;
  commuteDestinations: string[];
  preferredNeighborhoods: string[];
  mustHaves: string[];
  dealbreakers: string[];
  topSharedPriorities: string[];
  compromiseAreas: string[];
  tensionFlags: string[];
  summary: string;
};

export type SearchBoardSummary = {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type BoardMemberRecord = {
  id: string;
  boardId: string;
  userId: string;
  role: "owner" | "member";
  joinedAt: string;
  createdAt: string;
  user: Pick<AuthUserRecord, "id" | "email" | "displayName" | "workAddress" | "secondaryWorkAddress">;
};

export type BoardInvitationRecord = {
  id: string;
  boardId: string;
  invitedByUserId: string;
  email: string;
  token: string;
  status: "pending" | "accepted" | "revoked";
  createdAt: string;
  acceptedAt: string | null;
};

export type BoardPageData = {
  isDemoMode: boolean;
  board: SearchBoardSummary;
  profile: SearchProfileData;
  roommates: RoommateRecord[];
  members: BoardMemberRecord[];
  invitations: BoardInvitationRecord[];
  groupSynthesis: GroupSynthesis;
  activity: BoardActivityRecord[];
  messages: ChatMessage[];
  boardListings: BoardListingRecord[];
  boardListingCommutesByBoardListingId: Record<string, BoardListingCommuteRecord>;
  listingVotesByBoardListingId: Record<string, BoardListingVoteRecord[]>;
  listingCommentsByBoardListingId: Record<string, BoardListingCommentRecord[]>;
  suggestedListings: SuggestedListingRecord[];
  currentDeckListings: SuggestedListingRecord[];
  currentBrowseRequest: ListingBrowseRequest | null;
  comparison: string;
  missingFields: string[];
};
