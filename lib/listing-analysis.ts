import type {
  BoardListingReviewRecord,
  GroupListingAnalysis,
  ListingRecord,
  RoommateListingFit,
  RoommateRecord,
} from "@/lib/types";
import { allocateRentFairly } from "@/lib/group-affordability";

type CommuteRoute = {
  originLabel: string;
  durationMinutes: number | null;
  distanceMiles: number | null;
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function includesLoose(values: string[], candidate: string) {
  const normalized = candidate.toLowerCase();
  return values.some((value) => {
    const target = value.toLowerCase();
    return normalized.includes(target) || target.includes(normalized);
  });
}

function dimension(score: number | null, explanation: string) {
  return { score: score === null ? null : clamp(score), explanation, known: score !== null };
}

function memberWeights(member: RoommateRecord) {
  return {
    price: 1.2,
    commute: member.commutePriority === "high" ? 1.5 : member.commutePriority === "low" ? 0.55 : 1,
    location: member.neighborhoodPriority === "high" ? 1.5 : member.neighborhoodPriority === "low" ? 0.55 : 1,
    space: member.spacePriority === "high" ? 1.5 : member.spacePriority === "low" ? 0.55 : 1,
    amenities: 1,
  };
}

function weightedOverall(
  dimensions: RoommateListingFit["dimensions"],
  weights: ReturnType<typeof memberWeights>,
  hardFailureCount: number,
) {
  const entries = (Object.keys(dimensions) as Array<keyof typeof dimensions>)
    .map((key) => ({ score: dimensions[key].score, weight: weights[key] }))
    .filter((entry): entry is { score: number; weight: number } => entry.score !== null);
  if (entries.length === 0) return null;
  const base = entries.reduce((sum, entry) => sum + entry.score * entry.weight, 0) /
    entries.reduce((sum, entry) => sum + entry.weight, 0);
  return clamp(base - hardFailureCount * 25);
}

function analyzeMember(input: {
  member: RoommateRecord;
  listing: ListingRecord;
  memberCount: number;
  rentShare: number | null;
  route: CommuteRoute | null;
}): RoommateListingFit {
  const { member, listing, route } = input;
  const hardFailures: string[] = [];
  const unknownConstraints: string[] = [];

  const idealBudget = member.idealBudget ?? member.budgetMax;
  const absoluteBudget = member.stretchBudget ?? member.budgetMax;
  const estimatedShare =
    input.rentShare ??
    (listing.price !== null && input.memberCount > 0 ? Math.round(listing.price / input.memberCount) : null);

  let price = dimension(null, "Rent or this roommate’s budget is still missing.");
  if (estimatedShare !== null && idealBudget !== null) {
    if (estimatedShare <= idealBudget) {
      price = dimension(100, `The suggested $${estimatedShare.toLocaleString()} share is within ${member.name}’s $${idealBudget.toLocaleString()} ideal.`);
    } else if (absoluteBudget !== null && estimatedShare <= absoluteBudget) {
      const over = estimatedShare - idealBudget;
      const range = Math.max(absoluteBudget - idealBudget, 1);
      price = dimension(
        88 - (over / range) * 28,
        `This is $${over.toLocaleString()} above ${member.name}’s ideal, but remains below the $${absoluteBudget.toLocaleString()} maximum.`,
      );
    } else if (absoluteBudget !== null) {
      const over = estimatedShare - absoluteBudget;
      hardFailures.push(`$${over.toLocaleString()} over ${member.name}’s absolute budget`);
      price = dimension(10, `The suggested share is $${over.toLocaleString()} above ${member.name}’s absolute maximum.`);
    }
  } else if (estimatedShare !== null) {
    unknownConstraints.push(`${member.name} has not completed a maximum budget`);
    price = dimension(null, `The estimated share is $${estimatedShare.toLocaleString()}, but ${member.name} has not entered a personal limit.`);
  }

  let commute = dimension(null, `${member.name} has not opted into commute matching.`);
  if (member.commuteDestination) {
    if (route?.durationMinutes == null) {
      unknownConstraints.push(`${member.name}’s commute has not been calculated`);
      commute = dimension(null, `The route to ${member.name}’s commute address is not available yet.`);
    } else {
      const minimum = member.preferredCommuteMinutes ?? 0;
      const maximum = member.maxCommuteMinutes;
      if (maximum !== null && route.durationMinutes > maximum) {
        hardFailures.push(`${member.name}’s commute exceeds the ${maximum}-minute maximum`);
        commute = dimension(8, `${route.durationMinutes} minutes is beyond ${member.name}’s hard ${maximum}-minute limit.`);
      } else if (route.durationMinutes < minimum) {
        const under = minimum - route.durationMinutes;
        commute = dimension(
          Math.max(10, 100 - under * 6),
          `${route.durationMinutes} minutes is ${under} minutes closer to work than ${member.name} wants to live.`,
        );
      } else {
        const range = maximum === null ? `${minimum}+ minutes` : `${minimum}–${maximum} minutes`;
        commute = dimension(100, `${route.durationMinutes} minutes is inside ${member.name}’s full-score commute range of ${range}.`);
      }
    }
  }

  const locationLabel = [listing.neighborhood, listing.city].filter(Boolean).join(", ");
  let location = dimension(null, `${member.name} has not entered preferred neighborhoods.`);
  if (member.preferredNeighborhoods.length > 0 && locationLabel) {
    const matches = member.preferredNeighborhoods.some((preference) =>
      locationLabel.toLowerCase().includes(preference.toLowerCase()),
    );
    location = matches
      ? dimension(100, `${locationLabel} matches one of ${member.name}’s preferred areas.`)
      : dimension(52, `${locationLabel} is outside ${member.name}’s stated preferred areas.`);
  }

  let space = dimension(null, "Bedroom or group-size information is incomplete.");
  if (listing.bedrooms !== null) {
    const privateRoomTarget = Math.max(input.memberCount, 1);
    if (listing.bedrooms >= privateRoomTarget) {
      space = dimension(100, `${listing.bedrooms} bedrooms supports a private room for each roommate.`);
    } else {
      const deficit = privateRoomTarget - listing.bedrooms;
      const requiresPrivateRoom = member.dealbreakers.some((value) => /private room|own room|bedroom/i.test(value));
      if (requiresPrivateRoom) hardFailures.push(`${member.name} requires a private bedroom`);
      space = dimension(60 - deficit * 18, `${listing.bedrooms} bedrooms leaves the group short by ${deficit} private room${deficit === 1 ? "" : "s"}.`);
    }
  }

  const amenities = listing.amenities.map((value) => value.toLowerCase());
  const requiredAmenities = member.mustHaves.filter((value) => !/no hard|none/i.test(value));
  const missingAmenities = requiredAmenities.filter((value) => !includesLoose(amenities, value));
  if (member.petsRequired && !includesLoose(amenities, "pet friendly")) missingAmenities.push("pet friendly");
  if (member.accessibilityNeeds.length > 0) {
    for (const need of member.accessibilityNeeds) {
      if (!includesLoose(amenities, need)) missingAmenities.push(need);
    }
  }

  let amenitiesDimension = dimension(null, `${member.name} has no hard amenity requirements on file.`);
  if (requiredAmenities.length > 0 || member.petsRequired || member.accessibilityNeeds.length > 0) {
    if (amenities.length === 0) {
      unknownConstraints.push(`Amenities must be verified for ${member.name}`);
      amenitiesDimension = dimension(null, "The listing does not provide enough amenity detail to test the hard requirements.");
    } else if (missingAmenities.length > 0) {
      hardFailures.push(...missingAmenities.map((value) => `${member.name} requires ${value}`));
      amenitiesDimension = dimension(15, `The listing does not confirm: ${missingAmenities.join(", ")}.`);
    } else {
      amenitiesDimension = dimension(100, `The known amenities satisfy ${member.name}’s hard requirements.`);
    }
  }

  const dimensions = { price, commute, location, space, amenities: amenitiesDimension };
  const overallScore = weightedOverall(dimensions, memberWeights(member), hardFailures.length);
  const knownCount = Object.values(dimensions).filter((entry) => entry.known).length;
  const explanation =
    hardFailures.length > 0
      ? `${member.name} has ${hardFailures.length} hard constraint${hardFailures.length === 1 ? "" : "s"} failing, so this cannot be treated as a clean fit.`
      : knownCount < 3
        ? `There is not enough verified data to make a strong claim for ${member.name} yet.`
        : `${member.name} has no known hard failure; the remaining tradeoffs are preferences rather than automatic dealbreakers.`;

  return {
    roommateId: member.id,
    name: member.name,
    overallScore,
    dimensions,
    hardFailures: Array.from(new Set(hardFailures)),
    unknownConstraints: Array.from(new Set(unknownConstraints)),
    explanation,
  };
}

export function analyzeListingForGroup(input: {
  listing: ListingRecord;
  members: RoommateRecord[];
  routes?: CommuteRoute[];
  reviews?: BoardListingReviewRecord[];
  sourceConfirmed?: boolean;
  latestVerification?: "unverified" | "active" | "unavailable" | "possibly_stale" | "incorrect_match";
}): GroupListingAnalysis {
  const split = allocateRentFairly(input.listing.price, input.members);
  const shares = new Map(split?.shares.map((share) => [share.memberId, share.amount]) ?? []);
  const routes = new Map((input.routes ?? []).map((route) => [route.originLabel.toLowerCase(), route]));
  const members = input.members.map((member) =>
    analyzeMember({
      member,
      listing: input.listing,
      memberCount: input.members.length,
      rentShare: shares.get(member.id) ?? null,
      route: routes.get(member.name.toLowerCase()) ?? null,
    }),
  );

  const scores = members.flatMap((member) => member.overallScore === null ? [] : [member.overallScore]);
  const average = scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
  const lowest = scores.length > 0 ? Math.min(...scores) : null;
  const disagreement = scores.length > 1 ? Math.max(...scores) - Math.min(...scores) : scores.length === 1 ? 0 : null;
  const hardFailureCount = members.reduce((sum, member) => sum + member.hardFailures.length, 0);
  const fairnessScore =
    average === null || lowest === null
      ? null
      : clamp((average * 0.55) + (lowest * 0.35) - ((disagreement ?? 0) * 0.35) - hardFailureCount * 12);

  const reviewScores = (input.reviews ?? []).flatMap((review) => review.interiorAppeal ?? []);
  const visualAverage = reviewScores.length > 0
    ? reviewScores.reduce((sum, score) => sum + score, 0) / reviewScores.length
    : null;
  const priceAverage = members.flatMap((member) => member.dimensions.price.score ?? []);
  const commuteAverage = members.flatMap((member) => member.dimensions.commute.score ?? []);
  const rankingLabel: GroupListingAnalysis["rankingLabel"] =
    visualAverage !== null && visualAverage >= 4.2
      ? "visually liked"
      : commuteAverage.length > 0 && commuteAverage.every((score) => score >= 80)
        ? "best commute balance"
        : priceAverage.length > 0 && priceAverage.every((score) => score >= 85)
          ? "best value"
          : fairnessScore !== null && fairnessScore >= 75 && hardFailureCount === 0
            ? "best overall"
            : "needs review";

  const unknownCount = members.reduce((sum, member) => sum + member.unknownConstraints.length, 0);
  const listingMissing = [
    input.listing.price === null ? "rent" : null,
    input.listing.bedrooms === null ? "bedrooms" : null,
    !input.listing.address ? "address" : null,
  ].filter(Boolean);
  const staleOrWrong = input.latestVerification === "possibly_stale" || input.latestVerification === "incorrect_match";
  const participationRatio = input.members.length > 0 ? scores.length / input.members.length : 0;
  const confidencePenalty =
    listingMissing.length +
    unknownCount +
    (input.sourceConfirmed ? 0 : 1) +
    (staleOrWrong ? 2 : 0) +
    (participationRatio < 1 ? 2 : 0);
  const confidence: GroupListingAnalysis["confidence"] =
    confidencePenalty <= 1 ? "high" : confidencePenalty <= 4 ? "medium" : "low";

  const nextActions = Array.from(new Set([
    !input.sourceConfirmed ? "Confirm the exact external listing source." : null,
    ...listingMissing.map((field) => `Confirm ${field}.`),
    ...members.flatMap((member) => member.unknownConstraints.map((constraint) => `Resolve: ${constraint}.`)),
    (input.reviews?.length ?? 0) < input.members.length ? "Wait for every roommate’s post-gallery review." : null,
    hardFailureCount > 0 ? "Resolve the hard constraints or remove this listing from serious consideration." : null,
  ].filter((value): value is string => Boolean(value)))).slice(0, 5);

  const verdict =
    hardFailureCount > 0
      ? `This should not lead the board yet because ${hardFailureCount} hard constraint${hardFailureCount === 1 ? " is" : "s are"} failing.`
      : fairnessScore === null
        ? "The listing is still too incomplete for a defensible group recommendation."
        : disagreement !== null && disagreement >= 25
          ? `The average fit looks acceptable, but the ${Math.round(disagreement)}-point spread means one roommate is carrying much more of the compromise.`
          : `This is a ${rankingLabel} candidate because the known tradeoffs are relatively balanced across the group.`;

  return {
    overallScore: average === null ? null : clamp(average),
    lowestRoommateScore: lowest,
    disagreement: disagreement === null ? null : Math.round(disagreement),
    fairnessScore,
    hardFailureCount,
    rankingLabel,
    verdict,
    confidence,
    confidenceReason:
      confidence === "high"
        ? "Essential listing facts, source quality, and roommate participation are strong."
        : confidence === "medium"
          ? "The direction is useful, but a few source, listing, commute, or participation details remain unresolved."
          : "Too many essential details or roommate inputs are missing to treat this result as final.",
    nextActions: nextActions.length > 0 ? nextActions : ["The group has enough information to make the next decision."],
    members,
  };
}
