"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  addListingAction,
  completeJoinedMemberSetupAction,
  confirmBoardProfileAction,
  createBoardInvitationAction,
  deleteBoardAction,
  sendChatAction,
} from "@/app/actions";
import { BrandMark } from "@/components/brand-mark";
import { BoardInvitePanel } from "@/components/board-invite-panel";
import type {
  AuthUserRecord,
  BoardListingCommentRecord,
  BoardListingRecord,
  BoardListingVoteRecord,
  BoardPageData,
} from "@/lib/types";

type BoardExperienceProps = {
  currentUser: AuthUserRecord | null;
  data: BoardPageData;
  recentBoards: Array<{ id: string; title: string; updatedAt: string }>;
  notice?: string | null;
  error?: string | null;
  forceMemberSetup?: boolean;
};

const VOTE_ORDER = ["love", "like", "maybe", "pass", "veto"] as const;
const SHORTLIST_STATUS_OPTIONS = ["all", "new", "interested", "maybe", "toured", "applied"] as const;
const SORT_OPTIONS = ["updated", "price-asc", "price-desc", "bedrooms-desc"] as const;

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatBoardTitle(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 54) return normalized;
  return `${normalized.slice(0, 51)}...`;
}

function compareLocationLabel(item: BoardListingRecord) {
  return [item.listing.neighborhood, item.listing.city].filter(Boolean).join(", ") || item.listing.address || "Untitled listing";
}

function formatCommuteSnippet(commute: BoardPageData["boardListingCommutesByBoardListingId"][string] | undefined) {
  if (!commute || commute.bestDurationMinutes === null) return "Commute still unavailable";
  return `${commute.bestDurationMinutes} min${commute.bestOriginLabel ? ` to ${commute.bestOriginLabel}` : ""}${
    commute.bestDistanceMiles !== null ? ` · ${commute.bestDistanceMiles} mi` : ""
  }`;
}

function formatCommuteModeLabel(mode: BoardPageData["commuteMode"]) {
  if (mode === "live") return "Live commute";
  if (mode === "demo") return "Demo commute";
  return "Commute API off";
}

function formatCommuteModeHelp(mode: BoardPageData["commuteMode"]) {
  if (mode === "live") {
    return "Route times are being estimated from your saved commute anchors.";
  }
  if (mode === "demo") {
    return "Demo mode is using staged commute values instead of live routing calls.";
  }
  return "Add OPENROUTESERVICE_API_KEY to turn live commute timing on for this workspace.";
}

function formatBudgetRange(profile: BoardPageData["profile"]) {
  const parts: string[] = [];
  if (profile.budgetMin !== undefined && profile.budgetMax !== undefined) {
    parts.push(`$${profile.budgetMin.toLocaleString()}–$${profile.budgetMax.toLocaleString()}`);
  } else if (profile.budgetMax !== undefined) {
    parts.push(`Up to $${profile.budgetMax.toLocaleString()}`);
  } else if (profile.budgetMin !== undefined) {
    parts.push(`From $${profile.budgetMin.toLocaleString()}`);
  }

  if (profile.stretchBudget !== undefined) {
    parts.push(`stretch $${profile.stretchBudget.toLocaleString()}`);
  }

  return parts.join(" · ") || "Budget still open";
}

function formatBedroomPreference(profile: BoardPageData["profile"]) {
  if (profile.bedroomsPreferred !== null && profile.bedroomsPreferred !== undefined) {
    const flexible = profile.bedroomsFlexible.length > 0 ? `, flexible on ${profile.bedroomsFlexible.join(", ")}` : "";
    return `${profile.bedroomsPreferred} bed${flexible}`;
  }
  if (profile.bedroomsFlexible.length > 0) {
    return profile.bedroomsFlexible.join(", ");
  }
  return "Bedroom count still open";
}

function formatBoardReadiness(data: BoardPageData) {
  if (data.profile.completionStatus === "confirmed") return "Ready to search as a group";
  if (data.completion.percentComplete >= 80) return "Almost ready";
  if (data.completion.percentComplete >= 50) return "Still shaping the brief";
  return "Early setup";
}

function formatToneLabel(value: string | null | undefined) {
  if (!value) return "Not set";
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildOpenDecisions(data: BoardPageData, shortlistCount: number) {
  const items: string[] = [];

  for (const field of data.missingFields.slice(0, 4)) {
    items.push(`Lock down ${field} so the workspace can stop guessing.`);
  }

  for (const flag of data.groupSynthesis.tensionFlags.slice(0, 3)) {
    items.push(flag);
  }

  if (shortlistCount === 0) {
    items.push("No contenders are saved yet, so the group does not have anything concrete to react to.");
  }

  if (data.members.length <= 1 && data.invitations.length === 0) {
    items.push("Only one person is active in the workspace so far, so shared tradeoffs are still mostly hypothetical.");
  }

  return items.slice(0, 5);
}

function buildOpenQuestions(data: BoardPageData, shortlistItems: BoardListingRecord[]) {
  const questions = shortlistItems.flatMap((item) => item.questionsToAsk).filter(Boolean);
  const uniqueQuestions = Array.from(new Set(questions));
  const output = uniqueQuestions.slice(0, 4);

  if (output.length === 0 && data.missingFields.length > 0) {
    return data.missingFields.slice(0, 4).map((field) => `Who is going to settle ${field}?`);
  }

  return output;
}

function getRoommateSetupSignals(roommate: BoardPageData["roommates"][number]) {
  return [
    roommate.budgetMax !== null,
    roommate.preferredNeighborhoods.length > 0,
    roommate.mustHaves.length > 0,
    roommate.dealbreakers.length > 0,
  ].filter(Boolean).length;
}

function getRoommateMissingSetup(roommate: BoardPageData["roommates"][number]) {
  const missing: string[] = [];
  if (roommate.budgetMax === null) missing.push("budget");
  if (roommate.maxCommuteMinutes !== null && !roommate.commuteDestination) missing.push("commute address");
  if (roommate.preferredNeighborhoods.length === 0) missing.push("neighborhoods");
  if (roommate.mustHaves.length === 0) missing.push("must-haves");
  if (roommate.dealbreakers.length === 0) missing.push("dealbreakers");
  return missing;
}

function buildNextAction(
  data: BoardPageData,
  shortlistCount: number,
  membersNeedingSetup: Array<BoardPageData["roommates"][number]>,
) {
  if (membersNeedingSetup.length > 0) {
    const firstPending = membersNeedingSetup[0];
    return {
      title: "Finish member setup",
      detail: `${firstPending.name} still needs ${getRoommateMissingSetup(firstPending).slice(0, 2).join(" and ")} before the workspace can weigh their tradeoffs properly.`,
      action: "member-setup" as const,
      label: "Complete member setup",
    };
  }

  if (data.missingFields.length > 0) {
    return {
      title: "Finish the search brief",
      detail: `The workspace is still missing ${data.missingFields.slice(0, 2).join(" and ")}. Clean that up before asking everyone to judge listings.`,
      action: "chat" as const,
      label: "Answer in shared chat",
    };
  }

  if (shortlistCount === 0) {
    return {
      title: "Import the first contender",
      detail: "Paste an exact listing link so the group can react to a real source instead of an unverified suggestion.",
      action: "import-link" as const,
      label: "Import a listing link",
    };
  }

  if (data.members.length <= 1 && data.invitations.length === 0) {
    return {
      title: "Bring in collaborators",
      detail: "The workspace is ready for more people. Add roommates or invite them so preferences and reactions come from the actual group.",
      action: "invite" as const,
      label: "Invite collaborators",
    };
  }

  return {
    title: "Pressure-test the shortlist",
    detail: "Ask the group to react to the saved listings, then compare the strongest practical option against the lifestyle-forward one.",
    action: "chat" as const,
    label: "Continue in chat",
  };
}

function formatRoommateBudget(roommate: BoardPageData["roommates"][number]) {
  if (roommate.budgetMax !== null) {
    const comfortable = roommate.budgetMin !== null
      ? `$${roommate.budgetMin.toLocaleString()}–$${roommate.budgetMax.toLocaleString()}`
      : `Up to $${roommate.budgetMax.toLocaleString()}`;
    return roommate.stretchBudget !== null && roommate.stretchBudget > roommate.budgetMax
      ? `${comfortable} · stretch $${roommate.stretchBudget.toLocaleString()}`
      : comfortable;
  }
  return "Budget still open";
}

function formatRoommateCommute(roommate: BoardPageData["roommates"][number]) {
  if (!roommate.commuteDestination) return "Commute not included";
  return roommate.maxCommuteMinutes
    ? `${roommate.commuteDestination} · max ${roommate.maxCommuteMinutes} min`
    : roommate.commuteDestination;
}

function formatRoommateStatus(roommate: BoardPageData["roommates"][number]) {
  const signals = getRoommateSetupSignals(roommate);

  if (signals >= 4) return "profile complete";
  if (signals >= 2) return "in progress";
  return "just started";
}

function formatSetupProgress(roommate: BoardPageData["roommates"][number]) {
  return `${getRoommateSetupSignals(roommate)}/4 core fields`;
}

function priorityWeight(priorities: string[], label: string) {
  return priorities.includes(label) ? 3 : 2;
}

function compareListingScore(
  item: BoardListingRecord,
  priorities: BoardPageData["profile"]["priorities"],
  commute: BoardPageData["boardListingCommutesByBoardListingId"][string] | undefined,
) {
  let score = 0;
  const listing = item.listing;

  if (listing.price !== null) {
    score += (listing.price <= 2500 ? 3 : listing.price <= 4000 ? 2 : 1) * priorityWeight(priorities, "price");
  }

  if (listing.squareFeet !== null) {
    score += (listing.squareFeet >= 850 ? 3 : listing.squareFeet >= 650 ? 2 : 1) * priorityWeight(priorities, "space");
  } else if (listing.bedrooms !== null) {
    score += listing.bedrooms * priorityWeight(priorities, "space");
  }

  if (listing.amenities.length > 0) {
    score += Math.min(3, listing.amenities.length) * priorityWeight(priorities, "amenities");
  }

  if (commute?.bestDurationMinutes !== null && commute?.bestDurationMinutes !== undefined) {
    const commuteBand = commute.bestDurationMinutes <= 25 ? 3 : commute.bestDurationMinutes <= 40 ? 2 : 1;
    score += commuteBand * priorityWeight(priorities, "commute");
  }

  if (item.userStatus === "interested") score += 4;
  if (item.userStatus === "toured") score += 5;
  if (item.aiRedFlags.length > 0) score -= item.aiRedFlags.length * 2;

  return score;
}

function buildCompareSummary(selectedListings: BoardListingRecord[], data: BoardPageData) {
  if (selectedListings.length === 0) return null;

  const scored = selectedListings.map((item) => ({
    item,
    commute: data.boardListingCommutesByBoardListingId[item.id],
    score: compareListingScore(item, data.profile.priorities, data.boardListingCommutesByBoardListingId[item.id]),
  }));

  const practical = [...scored].sort((left, right) => {
    const leftPrice = left.item.listing.price ?? Number.MAX_SAFE_INTEGER;
    const rightPrice = right.item.listing.price ?? Number.MAX_SAFE_INTEGER;
    if (leftPrice !== rightPrice) return leftPrice - rightPrice;
    return right.score - left.score;
  })[0]?.item ?? null;

  const lifestyle = [...scored].sort((left, right) => {
    const leftSignal = (left.item.listing.amenities.length * 2) + (left.item.listing.squareFeet ?? 0) / 300;
    const rightSignal = (right.item.listing.amenities.length * 2) + (right.item.listing.squareFeet ?? 0) / 300;
    return rightSignal - leftSignal;
  })[0]?.item ?? null;

  const commuteWinner = [...scored]
    .filter((entry) => entry.commute?.bestDurationMinutes !== null && entry.commute?.bestDurationMinutes !== undefined)
    .sort((left, right) => (left.commute?.bestDurationMinutes ?? Number.MAX_SAFE_INTEGER) - (right.commute?.bestDurationMinutes ?? Number.MAX_SAFE_INTEGER))[0]
    ?.item ?? null;

  const risky = [...scored].sort((left, right) => {
    const leftRisk = left.item.aiRedFlags.length + (left.item.listing.price === null ? 2 : 0) + (left.item.listing.squareFeet === null ? 1 : 0);
    const rightRisk = right.item.aiRedFlags.length + (right.item.listing.price === null ? 2 : 0) + (right.item.listing.squareFeet === null ? 1 : 0);
    return rightRisk - leftRisk;
  })[0]?.item ?? null;

  const summaryParts: string[] = [];
  const membersNeedingSetup = data.roommates.filter((roommate) => getRoommateSetupSignals(roommate) < 4);
  const confidenceLabel = data.groupSynthesis.confidenceLabel ?? "medium";
  const confidenceTone =
    confidenceLabel === "high"
      ? "stable"
      : confidenceLabel === "medium"
        ? "directional"
        : "provisional";

  if (membersNeedingSetup.length > 0) {
    summaryParts.push(
      `This workspace read is still provisional because ${membersNeedingSetup.length} collaborator${
        membersNeedingSetup.length === 1 ? "" : "s"
      } still need to finish setup, so affordability and preference tradeoffs may still move.`,
    );
  } else if (confidenceLabel === "low") {
    summaryParts.push(
      "This workspace read is still provisional because the group's budget, commute, or neighborhood preferences are not aligned enough yet to treat the shortlist as settled.",
    );
  } else if (confidenceLabel === "medium") {
    summaryParts.push(
      "This workspace read is directionally useful, but a few unresolved tradeoffs could still reshuffle which listing feels best for the group.",
    );
  }

  if (practical) {
    summaryParts.push(
      confidenceLabel === "high"
        ? `${compareLocationLabel(practical)} looks like the strongest practical option right now because it keeps the workspace closest to a stable baseline on price, saved status, and overall completeness.`
        : confidenceLabel === "medium"
          ? `${compareLocationLabel(practical)} currently reads like the strongest practical option because it keeps the workspace closest to a stable baseline on price, saved status, and overall completeness.`
          : `${compareLocationLabel(practical)} is the best early practical candidate so far because it keeps the workspace closest to a stable baseline on price, saved status, and overall completeness.`,
    );
  }

  if (commuteWinner) {
    summaryParts.push(
      `${compareLocationLabel(commuteWinner)} currently has the cleanest group commute read at ${formatCommuteSnippet(
        data.boardListingCommutesByBoardListingId[commuteWinner.id],
      )}.`,
    );
  }

  if (lifestyle && lifestyle.id !== practical?.id) {
    summaryParts.push(
      confidenceLabel === "high"
        ? `${compareLocationLabel(lifestyle)} reads more like the lifestyle-forward pick, especially if space or amenities end up mattering more than the cleanest budget case.`
        : `${compareLocationLabel(lifestyle)} looks more like the lifestyle-forward pick for now, especially if space or amenities end up mattering more than the cleanest budget case.`,
    );
  }

  if (risky) {
    const riskReason =
      risky.aiRedFlags.length > 0
        ? `The main concern is ${risky.aiRedFlags[0].toLowerCase()}.`
        : "The main concern is that too much of the important detail is still missing.";
    summaryParts.push(`${compareLocationLabel(risky)} is the riskiest option in this set. ${riskReason}`);
  }

  const topPriority = data.profile.priorities[0];

  if (topPriority) {
    summaryParts.push(
      `Since the workspace is currently leaning hardest on ${topPriority}, the best choice should probably be the listing that survives that pressure without creating too many unknowns for the rest of the group.`,
    );
  }

  return {
    confidenceTone,
    practical,
    lifestyle,
    commuteWinner,
    risky,
    narrative: summaryParts.join(" "),
  };
}

export function BoardExperience({ currentUser, data, recentBoards, notice = null, error = null, forceMemberSetup = false }: BoardExperienceProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [chatInput, setChatInput] = useState("");
  const [shortlistStatusFilter, setShortlistStatusFilter] = useState<(typeof SHORTLIST_STATUS_OPTIONS)[number]>("all");
  const [voteFilter, setVoteFilter] = useState<"all" | (typeof VOTE_ORDER)[number]>("all");
  const [sortMode, setSortMode] = useState<(typeof SORT_OPTIONS)[number]>("updated");
  const [focusedListingId, setFocusedListingId] = useState<string | null>(null);
  const [isRefreshingBoard, setIsRefreshingBoard] = useState(false);
  const chatThreadRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const readyForDeck = data.missingFields.length === 0;
  const shortlistItems = useMemo(() => {
    const filtered = data.boardListings
      .filter((item) => item.userStatus !== "rejected")
      .filter((item) => (shortlistStatusFilter === "all" ? true : item.userStatus === shortlistStatusFilter))
      .filter((item) => {
        if (voteFilter === "all") return true;
        const votes = data.listingVotesByBoardListingId[item.id] ?? [];
        return votes.some((vote) => vote.vote === voteFilter);
      });

    return [...filtered].sort((left, right) => {
      if (sortMode === "price-asc") return (left.listing.price ?? Number.MAX_SAFE_INTEGER) - (right.listing.price ?? Number.MAX_SAFE_INTEGER);
      if (sortMode === "price-desc") return (right.listing.price ?? -1) - (left.listing.price ?? -1);
      if (sortMode === "bedrooms-desc") return (right.listing.bedrooms ?? -1) - (left.listing.bedrooms ?? -1);
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
  }, [data.boardListings, data.listingVotesByBoardListingId, shortlistStatusFilter, sortMode, voteFilter]);
  const isDemoMode = data.isDemoMode;
  const currentRoommateId = data.roommates.find((roommate) => roommate.linkedUserId === currentUser?.id)?.id ?? data.roommates[0]?.id ?? "";
  const shortlistCountLabel = shortlistItems.length === 1 ? "1 active listing" : `${shortlistItems.length} active listings`;
  const focusedListing = shortlistItems.find((item) => item.id === focusedListingId) ?? null;
  const compareSummary = useMemo(() => buildCompareSummary(shortlistItems.slice(0, 3), data), [shortlistItems, data]);
  const cityLabel = data.profile.city || data.profile.locations[0] || data.board.city || "City still open";
  const moveInLabel = data.profile.moveInDate || data.profile.moveInTimeframe || "Move-in still open";
  const currentRoommate = data.roommates.find((roommate) => roommate.linkedUserId === currentUser?.id) ?? null;
  const membersNeedingSetup = useMemo(
    () => data.roommates.filter((roommate) => getRoommateSetupSignals(roommate) < 4),
    [data.roommates],
  );
  const fullyReadyMembers = data.roommates.length - membersNeedingSetup.length;
  const memberNeedsSetup =
    forceMemberSetup ||
    (currentRoommate
      ? currentRoommate.budgetMax === null ||
        currentRoommate.preferredNeighborhoods.length === 0 ||
        currentRoommate.mustHaves.length === 0
      : false);
  const groupSizeLabel = data.profile.groupSize ?? data.members.length ?? data.roommates.length;
  const commuteTargets = Array.from(
    new Set(data.groupSynthesis.commuteDestinations.filter(Boolean)),
  ) as string[];
  const openDecisions = useMemo(() => {
    const decisions = buildOpenDecisions(data, shortlistItems.length);
    for (const roommate of membersNeedingSetup.slice(0, 2).reverse()) {
      decisions.unshift(
        `${roommate.name} still needs ${getRoommateMissingSetup(roommate).slice(0, 2).join(" and ")} before the group read is fully trustworthy.`,
      );
    }
    return decisions.slice(0, 5);
  }, [data, shortlistItems.length, membersNeedingSetup]);
  const openQuestions = useMemo(() => buildOpenQuestions(data, shortlistItems), [data, shortlistItems]);
  const nextAction = useMemo(
    () => buildNextAction(data, shortlistItems.length, membersNeedingSetup),
    [data, shortlistItems.length, membersNeedingSetup],
  );
  const recentMessages = data.messages.slice(-4);
  const readinessLabel =
    membersNeedingSetup.length === 0
      ? "Group-ready"
      : fullyReadyMembers === 0
        ? "Setup still forming"
        : "Partially ready";
  const readinessDetail =
    membersNeedingSetup.length === 0
      ? data.invitations.length > 0
        ? `Everyone in the workspace is ready, but ${data.invitations.length} invite${data.invitations.length === 1 ? " is" : "s are"} still pending.`
        : "Everyone in the workspace has contributed enough signal for shared matching to feel credible."
      : `${membersNeedingSetup.length} collaborator${membersNeedingSetup.length === 1 ? "" : "s"} still need setup before the group read is fully trustworthy.`;
  const readyMembers = useMemo(
    () => data.roommates.filter((roommate) => getRoommateSetupSignals(roommate) >= 4),
    [data.roommates],
  );
  const collaborationStateItems = useMemo(
    () => [
      ...readyMembers.map((roommate) => ({
        key: `ready:${roommate.id}`,
        label: roommate.name,
        state: "Active and ready",
        detail: `Budget, neighborhoods, and core constraints are in${roommate.commuteDestination ? ", with commute enabled" : ""}.`,
      })),
      ...membersNeedingSetup.map((roommate) => ({
        key: `incomplete:${roommate.id}`,
        label: roommate.name,
        state: "Active but incomplete",
        detail: `Still missing ${getRoommateMissingSetup(roommate).slice(0, 3).join(", ")}.`,
      })),
      ...data.invitations.map((invitation) => ({
        key: `invite:${invitation.id}`,
        label: invitation.email ?? "Anyone with the code",
        state: "Invited, not joined",
        detail: `Invite created ${formatTimestamp(invitation.createdAt)}.`,
      })),
    ],
    [data.invitations, membersNeedingSetup, readyMembers],
  );

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("rental-advisor-theme");
    const nextTheme =
      savedTheme === "light" || savedTheme === "dark"
        ? savedTheme
        : window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;

    const collapsed = window.localStorage.getItem("rental-advisor-sidebar-collapsed");
    if (collapsed === "true") setIsSidebarCollapsed(true);
  }, []);

  useEffect(() => {
    if (!chatThreadRef.current) return;
    chatThreadRef.current.scrollTop = chatThreadRef.current.scrollHeight;
  }, [data.messages]);

  useEffect(() => {
    let disposed = false;

    async function refreshBoard() {
      if (disposed || document.visibilityState !== "visible") return;
      setIsRefreshingBoard(true);
      router.refresh();
      window.setTimeout(() => {
        if (!disposed) setIsRefreshingBoard(false);
      }, 600);
    }

    const interval = window.setInterval(() => {
      void refreshBoard();
    }, 15000);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void refreshBoard();
      }
    }

    function handleFocus() {
      void refreshBoard();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [router]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("rental-advisor-theme", next);
  }

  function toggleSidebar() {
    const next = !isSidebarCollapsed;
    setIsSidebarCollapsed(next);
    window.localStorage.setItem("rental-advisor-sidebar-collapsed", String(next));
  }

  async function submitChat() {
    if (!chatInput.trim()) return;

    const formData = new FormData();
    formData.set("boardId", data.board.id);
    formData.set("content", chatInput);

    startTransition(async () => {
      await sendChatAction(formData);
      setChatInput("");
      router.refresh();
    });
  }

  function handleChatKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitChat();
      return;
    }

    if (event.key === " " && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submitChat();
    }
  }

  function handleNextAction() {
    if (nextAction.action === "import-link") {
      const importSection = document.getElementById("link-import-section");
      importSection?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (nextAction.action === "member-setup") {
      const setupSection = document.getElementById("member-setup-card");
      setupSection?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (nextAction.action === "invite") {
      const inviteSection = document.getElementById("quick-invite-card");
      inviteSection?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    chatInputRef.current?.focus();
  }

  return (
    <main className={`app-shell ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar mac-sidebar">
        <div className="sidebar-toolbar">
          <button type="button" className="icon-button" onClick={toggleSidebar} aria-label="Toggle sidebar">
            {isSidebarCollapsed ? "›" : "‹"}
          </button>
          <button type="button" className="icon-button" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? "◐" : "◑"}
          </button>
          <Link href="/settings" className="icon-button" aria-label="Open settings">
            ⚙
          </Link>
        </div>

        <div className="sidebar-brand sidebar-account">
          <BrandMark className="brand-mark" />
          {!isSidebarCollapsed ? (
            <div className="sidebar-account-copy">
              <strong>{currentUser?.displayName ?? "Homeboard"}</strong>
              <p>{currentUser?.workAddress ?? "Commute anchor not set"}</p>
            </div>
          ) : null}
        </div>

        <div className="sidebar-section">
          {!isSidebarCollapsed ? <div className="sidebar-label">Boards</div> : null}
          <div className="sidebar-board-list">
            <Link href="/" className="sidebar-board-link muted-link">
              <span>{isSidebarCollapsed ? "+" : "New workspace"}</span>
              {!isSidebarCollapsed ? <small>start</small> : null}
            </Link>
            {recentBoards.map((board) => (
              <div key={board.id} className="sidebar-board-row">
                <Link
                  href={`/boards/${board.id}`}
                  className={`sidebar-board-link ${board.id === data.board.id ? "active" : ""}`}
                  title={board.title}
                >
                  {isSidebarCollapsed ? (
                    <span>{formatBoardTitle(board.title).slice(0, 1).toUpperCase()}</span>
                  ) : (
                    <>
                      <span className="sidebar-board-title">{formatBoardTitle(board.title)}</span>
                      <small className="sidebar-board-date">{new Date(board.updatedAt).toLocaleDateString()}</small>
                    </>
                  )}
                </Link>
                {!isSidebarCollapsed ? (
                  <details className="overflow-menu">
                    <summary className="overflow-trigger" aria-label={`More actions for ${board.title}`}>
                      ...
                    </summary>
                    <div className="overflow-panel">
                      <form action={deleteBoardAction}>
                        <input type="hidden" name="boardId" value={board.id} />
                        <input type="hidden" name="redirectTo" value="/" />
                        <button type="submit" className="sidebar-delete-button" aria-label={`Delete ${board.title}`}>
                          Delete workspace
                        </button>
                      </form>
                    </div>
                  </details>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </aside>

      <section className="board-stage">
        <section className="board-home-shell">
          <header className="board-home-header rail-card">
            <div className="board-home-header-copy">
              <div className="home-badge">Shared workspace</div>
              <h1>{data.board.title}</h1>
              <p>{data.groupSynthesis.summary}</p>
              <div className="board-readiness-bar">
                <div className="board-readiness-block">
                  <span>Group readiness</span>
                  <strong>{readinessLabel}</strong>
                </div>
                <div className="board-readiness-block">
                  <span>Members ready</span>
                  <strong>{fullyReadyMembers}/{data.roommates.length || data.members.length || 1}</strong>
                </div>
                <div className="board-readiness-block">
                  <span>Pending invites</span>
                  <strong>{data.invitations.length}</strong>
                </div>
                <div className="board-readiness-block">
                  <span>Commute status</span>
                  <strong>{formatCommuteModeLabel(data.commuteMode)}</strong>
                </div>
              </div>
              <p className="board-readiness-copy">{readinessDetail}</p>
              <p className="settings-help-copy">{formatCommuteModeHelp(data.commuteMode)}</p>
              <p className="settings-help-copy">
                  {isRefreshingBoard ? "Refreshing workspace activity..." : "The workspace refreshes quietly while collaborators are active so everyone stays close to the same state."}
                </p>
            </div>
            <div className="board-home-actions">
              <Link href={`/settings?boardId=${data.board.id}`} className="secondary-button">
                Edit board
              </Link>
              <a href="#link-import-section" className="primary-sidebar-button">
                Import listing link
              </a>
            </div>
          </header>

          <nav className="board-section-nav rail-card" aria-label="Board sections">
            <a href="#group-brief-section" className="saved-pill">Group brief</a>
            <a href="#shortlist-section" className="saved-pill">Shortlist</a>
            <a href="#member-preferences-section" className="saved-pill">Members</a>
            <a href="#activity-section" className="saved-pill">Activity</a>
          </nav>

          {notice ? <div className="account-message account-message-notice">{notice}</div> : null}
          {error ? <div className="account-message account-message-error">{error}</div> : null}

          {memberNeedsSetup && currentRoommate ? (
            <section id="member-setup-card" className="rail-card board-home-section">
              <div className="rail-card-header">
                <h2>Complete your member setup</h2>
                <span>{formatSetupProgress(currentRoommate)}</span>
              </div>
              <p>
                Add your own contribution range and preferences. Commute matching is optional, but it requires a real
                work or school address when enabled.
              </p>
              <div className="detail-chip-wrap">
                {getRoommateMissingSetup(currentRoommate).map((field) => (
                  <span key={field} className="saved-pill">{field} still needed</span>
                ))}
              </div>
              <form action={completeJoinedMemberSetupAction} className="account-form">
                <input type="hidden" name="boardId" value={data.board.id} />
                <div className="account-form-grid account-form-grid-2">
                  <label className="field-stack">
                    <span>Comfortable monthly minimum</span>
                    <input
                      name="budgetMin"
                      placeholder="1200"
                      inputMode="numeric"
                      defaultValue={currentRoommate.budgetMin ?? ""}
                    />
                  </label>
                  <label className="field-stack">
                    <span>Comfortable monthly maximum</span>
                    <input
                      name="budgetMax"
                      placeholder="1700"
                      inputMode="numeric"
                      defaultValue={currentRoommate.budgetMax ?? ""}
                    />
                  </label>
                </div>
                <div className="account-form-grid account-form-grid-2">
                  <label className="field-stack">
                    <span>Stretch maximum</span>
                    <input
                      name="stretchBudget"
                      placeholder="1800"
                      inputMode="numeric"
                      defaultValue={currentRoommate.stretchBudget ?? ""}
                    />
                  </label>
                  <label className="field-stack">
                    <span>Commute address (optional)</span>
                    <input
                      name="commuteDestination"
                      placeholder="350 5th Ave, New York, NY"
                      defaultValue={currentRoommate.commuteDestination ?? ""}
                    />
                  </label>
                </div>
                <div className="account-form-grid account-form-grid-2">
                  <label className="field-stack">
                    <span>Maximum commute in minutes</span>
                    <input
                      name="maxCommuteMinutes"
                      placeholder="40"
                      inputMode="numeric"
                      defaultValue={currentRoommate.maxCommuteMinutes ?? ""}
                    />
                  </label>
                  <label className="field-stack">
                    <span>Preferred neighborhoods</span>
                    <input
                      name="preferredNeighborhoods"
                      placeholder="Astoria, Sunnyside"
                      defaultValue={currentRoommate.preferredNeighborhoods.join(", ")}
                    />
                  </label>
                </div>
                <div className="account-form-grid account-form-grid-2">
                  <label className="field-stack">
                    <span>Must-haves</span>
                    <input
                      name="mustHaves"
                      placeholder="laundry, train access"
                      defaultValue={currentRoommate.mustHaves.join(", ")}
                    />
                  </label>
                  <label className="field-stack">
                    <span>Dealbreakers</span>
                    <input
                      name="dealbreakers"
                      placeholder="over 1800, no dishwasher"
                      defaultValue={currentRoommate.dealbreakers.join(", ")}
                    />
                  </label>
                </div>
                <label className="field-stack">
                  <span>How you think about the search</span>
                  <textarea
                    name="notes"
                    rows={3}
                    placeholder="Example: I can compromise on neighborhood if the commute is clean."
                    defaultValue={currentRoommate.notes ?? ""}
                  />
                </label>
                <button type="submit" className="account-primary-button">Save my setup</button>
              </form>
            </section>
          ) : null}

          <section className="board-home-summary-grid">
            <article className="board-overview-card">
              <span>City</span>
              <strong>{cityLabel}</strong>
            </article>
            <article className="board-overview-card">
              <span>Move-in</span>
              <strong>{moveInLabel}</strong>
            </article>
            <article className="board-overview-card">
              <span>Group size</span>
              <strong>{groupSizeLabel || "Not set yet"}</strong>
            </article>
            <article className="board-overview-card">
              <span>Budget</span>
              <strong>{formatBudgetRange(data.profile)}</strong>
            </article>
            <article className="board-overview-card">
              <span>Commute</span>
              <strong>{commuteTargets.length > 0 ? commuteTargets.join(", ") : "No commute target set"}</strong>
            </article>
            <article className="board-overview-card">
              <span>Readiness</span>
              <strong>{formatBoardReadiness(data)}</strong>
            </article>
            <article className="board-overview-card">
              <span>Group confidence</span>
              <strong>{data.groupSynthesis.confidenceLabel ?? "unknown"}</strong>
            </article>
            <article className="board-overview-card">
              <span>Collaborators</span>
              <strong>
                {data.members.length} active
                {data.invitations.length > 0 ? ` · ${data.invitations.length} pending` : ""}
              </strong>
            </article>
            <article className="board-overview-card">
              <span>Member setup</span>
              <strong>{membersNeedingSetup.length === 0 ? "All core fields in" : `${membersNeedingSetup.length} still incomplete`}</strong>
            </article>
          </section>

          <div className="board-home-layout">
            <div className="board-home-main">
              <section id="group-brief-section" className="rail-card board-home-section">
                <div className="rail-card-header">
                  <h2>Group Brief</h2>
                  <span>{formatToneLabel(data.groupSynthesis.confidenceLabel ?? data.profile.completionStatus)}</span>
                </div>
                <p>
                  The workspace is currently centered on {cityLabel}, moving {moveInLabel.toLowerCase()}, with{" "}
                  {(data.groupSynthesis.budgetRangeText ?? "member budgets still open").toLowerCase()} available across the group.
                  Bedroom preference is {formatBedroomPreference(data.profile).toLowerCase()}.
                </p>
                {data.groupSynthesis.confidenceReason ? <p>{data.groupSynthesis.confidenceReason}</p> : null}
                <div className="detail-chip-wrap">
                  <span className="saved-pill">budget {data.groupSynthesis.budgetOverlapStatus ?? "unknown"}</span>
                  <span className="saved-pill">commute {data.groupSynthesis.commuteAlignment ?? "unknown"}</span>
                  <span className="saved-pill">neighborhoods {data.groupSynthesis.neighborhoodAlignment ?? "unknown"}</span>
                  {data.groupSynthesis.budgetRangeText ? <span className="saved-pill">{data.groupSynthesis.budgetRangeText}</span> : null}
                </div>
                <div className="detail-chip-wrap">
                  {data.profile.priorities.length > 0 ? data.profile.priorities.map((priority) => (
                    <span key={priority} className="saved-pill">{priority}</span>
                  )) : <span className="saved-pill">priorities still open</span>}
                  {data.profile.mustHaves.slice(0, 4).map((item) => (
                    <span key={item} className="saved-pill">{item}</span>
                  ))}
                  {data.profile.neighborhoods.slice(0, 4).map((item) => (
                    <span key={item} className="saved-pill">{item}</span>
                  ))}
                </div>
                {currentUser?.id === data.board.userId && data.profile.completionStatus === "complete" ? (
                  <form action={confirmBoardProfileAction} className="stage-actions">
                    <input type="hidden" name="boardId" value={data.board.id} />
                    <button type="submit" className="primary-sidebar-button">Confirm shared profile</button>
                  </form>
                ) : null}
              </section>

              <section className="rail-card board-home-section">
                <div className="rail-card-header">
                  <h2>Open Decisions</h2>
                  <span>{openDecisions.length} active</span>
                </div>
                {openDecisions.length > 0 ? (
                  <div className="board-home-list">
                    {openDecisions.map((decision) => (
                      <article key={decision} className="board-home-list-item">
                        <strong>Open decision</strong>
                        <p>{decision}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p>No major blockers are visible right now. The group brief is coherent enough to keep moving.</p>
                )}
              </section>

              <section className="rail-card board-home-section">
                <div className="rail-card-header">
                  <h2>Collaboration State</h2>
                  <span>{collaborationStateItems.length} people / invites</span>
                </div>
                {collaborationStateItems.length > 0 ? (
                  <div className="board-home-list">
                    {collaborationStateItems.map((item) => (
                      <article key={item.key} className="board-home-list-item">
                        <strong>{item.label}</strong>
                        <p>{item.detail}</p>
                        <span className="mini-meta">{item.state}</span>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p>No collaborators or invites yet. Bring someone in so the shared view becomes real.</p>
                )}
              </section>

              <section id="link-import-section" className="rail-card board-home-section">
                <div className="rail-card-header">
                  <h2>Import listing link</h2>
                  <span>Exact source only</span>
                </div>
                <p>
                  Paste the individual Zillow, StreetEasy, or broker listing URL.
                  Homeboard keeps the original source attached to the shared board.
                </p>
                <form action={addListingAction} className="account-form">
                  <input type="hidden" name="boardId" value={data.board.id} />
                  <input type="hidden" name="method" value="pasted_link" />
                  <label className="field-stack">
                    <span>Listing link</span>
                    <input
                      name="sourceUrl"
                      type="url"
                      inputMode="url"
                      autoComplete="url"
                      placeholder="https://www.zillow.com/homedetails/..."
                      required
                    />
                  </label>
                  <button type="submit" className="account-primary-button">
                    Import to Homeboard
                  </button>
                </form>
              </section>

              <section id="shortlist-section" className="rail-card board-home-section">
                <div className="rail-card-header">
                  <h2>Shortlist</h2>
                  <span>{shortlistCountLabel}</span>
                </div>
                {shortlistItems.length > 0 ? (
                  <>
                    <div className="board-home-shortlist">
                      {shortlistItems.slice(0, 3).map((item) => (
                        <article key={item.id} className="board-home-shortlist-card">
                          <div className="compare-card-head">
                            <strong>{compareLocationLabel(item)}</strong>
                            <span>{item.userStatus}</span>
                          </div>
                          <div className="compare-stat-list">
                            <span>Price: {item.listing.price ? `$${item.listing.price.toLocaleString()}` : "unknown"}</span>
                            <span>Commute: {formatCommuteSnippet(data.boardListingCommutesByBoardListingId[item.id])}</span>
                            <span>Votes: {(data.listingVotesByBoardListingId[item.id] ?? []).length}</span>
                          </div>
                          <p>{item.aiSummary ?? item.aiTradeoffAnalysis ?? "No saved summary yet."}</p>
                          <div className="stage-actions">
                            <button type="button" className="secondary-button" onClick={() => setFocusedListingId(item.id)}>
                              View details
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                    {compareSummary ? (
                      <div className="compare-summary-card">
                        <strong>Current workspace read</strong>
                        <span className="saved-pill">{compareSummary.confidenceTone}</span>
                        <p>{compareSummary.narrative}</p>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p>Nothing is on the shortlist yet. Import an exact listing link so the group can react to a real source.</p>
                )}
              </section>

              <section className="rail-card board-home-section">
                <div className="rail-card-header">
                  <h2>Shared Chat</h2>
                  <span>{recentMessages.length} latest messages</span>
                </div>
                <div className="board-home-chat-preview" ref={chatThreadRef}>
                  {recentMessages.map((message) => (
                    <article key={message.id} className={`modern-message ${message.role}`}>
                      {message.role === "assistant" ? <div className="avatar">A</div> : null}
                      <div className="message-body">
                        <span className="message-role">{message.role === "assistant" ? "Advisor" : message.authorName ?? "Board member"}</span>
                        <p>{message.content}</p>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="chat-input-shell board-home-chat-shell">
                  <textarea
                    ref={chatInputRef}
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    onKeyDown={handleChatKeyDown}
                    rows={3}
                    placeholder="Update the brief, add a concern, ask for more listings, or tell the group what changed."
                  />
                  <div className="chat-input-footer">
                    <div className="chat-hints">
                      <span>
                        {data.missingFields.length > 0
                          ? `Profile ${data.completion.percentComplete}% complete · still collecting: ${data.missingFields.join(", ")}`
                          : "The shared brief is in good shape. Use chat for changes, clarifications, and reactions as the search evolves."}
                      </span>
                    </div>
                    <button type="button" onClick={submitChat} disabled={isPending}>
                      {isPending ? "Updating..." : "Send"}
                    </button>
                  </div>
                </div>
              </section>
            </div>

            <aside className="board-home-side">
              <section className="rail-card board-home-section">
                <div className="rail-card-header">
                  <h2>Next Best Action</h2>
                  <span>Recommended</span>
                </div>
                <p>{nextAction.detail}</p>
                <button type="button" className="primary-sidebar-button" onClick={handleNextAction}>
                  {nextAction.label}
                </button>
              </section>

              <section id="quick-invite-card" className="rail-card board-home-section">
                <div className="rail-card-header">
                  <h2>Invite Collaborators</h2>
                  <span>{data.invitations.length} pending</span>
                </div>
                <p>
                  Create a code and send it by text or any app. Email-locking is optional; Homeboard does not send the message for you.
                </p>
                <form action={createBoardInvitationAction} className="account-form">
                  <input type="hidden" name="boardId" value={data.board.id} />
                  <input type="hidden" name="redirectTo" value={`/boards/${data.board.id}`} />
                  <label className="field-stack">
                    <span>Restrict to email (optional)</span>
                    <input name="email" type="email" placeholder="Leave blank for anyone" />
                  </label>
                  <button type="submit" className="account-primary-button">Create shareable code</button>
                </form>
                <BoardInvitePanel boardId={data.board.id} invitations={data.invitations} redirectTo={`/boards/${data.board.id}`} />
              </section>

              <section id="member-preferences-section" className="rail-card board-home-section">
                <div className="rail-card-header">
                  <h2>Member Preferences</h2>
                  <span>
                    {data.members.length} active
                    {data.invitations.length > 0 ? ` · ${data.invitations.length} invited` : ""}
                  </span>
                </div>
                {data.roommates.length > 0 ? (
                  <div className="member-preference-grid">
                    {data.roommates.map((roommate) => (
                      <article key={roommate.id} className="member-preference-card">
                        <div className="member-preference-head">
                          <div>
                            <strong>{roommate.name}</strong>
                            <span>{roommate.roleLabel}</span>
                          </div>
                          <span className="saved-pill">{formatRoommateStatus(roommate)}</span>
                        </div>

                        <div className="compare-stat-list">
                          <span>Setup: {formatSetupProgress(roommate)}</span>
                          {getRoommateMissingSetup(roommate).length > 0 ? (
                            <span>Missing: {getRoommateMissingSetup(roommate).slice(0, 2).join(", ")}</span>
                          ) : (
                            <span>Ready for group matching</span>
                          )}
                        </div>

                        <div className="member-preference-list">
                          <div>
                            <span>Budget</span>
                            <strong>{formatRoommateBudget(roommate)}</strong>
                          </div>
                          <div>
                            <span>Commute</span>
                            <strong>{formatRoommateCommute(roommate)}</strong>
                          </div>
                          <div>
                            <span>Neighborhoods</span>
                            <strong>
                              {roommate.preferredNeighborhoods.length > 0
                                ? roommate.preferredNeighborhoods.join(", ")
                                : "No neighborhood lean yet"}
                            </strong>
                          </div>
                          <div>
                            <span>Must-haves</span>
                            <strong>
                              {roommate.mustHaves.length > 0 ? roommate.mustHaves.join(", ") : "Not set yet"}
                            </strong>
                          </div>
                          <div>
                            <span>Dealbreakers</span>
                            <strong>
                              {roommate.dealbreakers.length > 0 ? roommate.dealbreakers.join(", ") : "None saved yet"}
                            </strong>
                          </div>
                          <div>
                            <span>Priorities</span>
                            <strong>
                              {[
                                roommate.commutePriority === "high" ? "short commute" : null,
                                roommate.neighborhoodPriority === "high" ? "neighborhood" : null,
                                roommate.spacePriority === "high" ? "space" : null,
                                roommate.privacyPriority === "high" ? "privacy" : null,
                              ]
                                .filter(Boolean)
                                .join(", ") || "No strong priority signal yet"}
                            </strong>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p>No roommate preference cards yet. Add collaborators so the workspace starts showing real tradeoffs between people.</p>
                )}
              </section>

              <section className="rail-card board-home-section">
                <div className="rail-card-header">
                  <h2>Open Questions</h2>
                  <span>{openQuestions.length}</span>
                </div>
                {openQuestions.length > 0 ? (
                  <div className="board-home-list">
                    {openQuestions.map((question) => (
                      <article key={question} className="board-home-list-item">
                        <strong>Question</strong>
                        <p>{question}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p>The workspace has no unresolved listing questions saved yet.</p>
                )}
              </section>

              <section id="activity-section" className="rail-card board-home-section">
                <div className="rail-card-header">
                  <h2>Recent Activity</h2>
                  <span>{data.activity.length} events</span>
                </div>
                <div className="activity-feed board-home-activity">
                  {data.activity.slice(0, 6).map((entry) => (
                    <article key={entry.id} className="activity-item">
                      <strong>{entry.actorName}</strong>
                      <p>{entry.content}</p>
                      <span className="mini-meta">{formatTimestamp(entry.createdAt)}</span>
                    </article>
                  ))}
                </div>
              </section>
            </aside>
          </div>
        </section>
      </section>

      {focusedListing ? (
        <ListingDetailModal
          boardListing={focusedListing}
          commute={data.boardListingCommutesByBoardListingId[focusedListing.id]}
          votes={data.listingVotesByBoardListingId[focusedListing.id] ?? []}
          comments={data.listingCommentsByBoardListingId[focusedListing.id] ?? []}
          onClose={() => setFocusedListingId(null)}
        />
      ) : null}
    </main>
  );
}

function VoteSummary({ votes }: { votes: BoardListingVoteRecord[] }) {
  if (votes.length === 0) {
    return <p className="mini-meta">No collaborator reactions yet.</p>;
  }

  const counts = VOTE_ORDER.map((vote) => ({
    vote,
    count: votes.filter((entry) => entry.vote === vote).length,
  })).filter((entry) => entry.count > 0);

  return (
    <div className="vote-summary">
      {counts.map((entry) => (
        <span key={entry.vote}>
          {entry.vote}: {entry.count}
        </span>
      ))}
    </div>
  );
}

function CommentFeed({ comments }: { comments: BoardListingCommentRecord[] }) {
  if (comments.length === 0) {
    return <p className="mini-meta">No notes yet.</p>;
  }

  return (
    <div className="comment-feed">
      {comments.slice(0, 3).map((comment) => (
        <article key={comment.id} className="comment-item">
          <strong>{comment.roommate.name}</strong>
          <p>{comment.content}</p>
        </article>
      ))}
    </div>
  );
}

function ListingDetailModal({
  boardListing,
  commute,
  votes,
  comments,
  onClose,
}: {
  boardListing: BoardListingRecord;
  commute: BoardPageData["boardListingCommutesByBoardListingId"][string] | undefined;
  votes: BoardListingVoteRecord[];
  comments: BoardListingCommentRecord[];
  onClose: () => void;
}) {
  const listing = boardListing.listing;
  const headline = [listing.neighborhood, listing.city].filter(Boolean).join(", ") || listing.address || "Untitled listing";
  const feeEntries = Object.entries(listing.fees ?? {}).filter(([, value]) => value !== null && value !== "");

  return (
    <div className="deck-overlay" onClick={onClose}>
      <div className="detail-modal" onClick={(event) => event.stopPropagation()}>
        <div className="detail-modal-head">
          <div>
            <span className="deck-counter">{boardListing.userStatus}</span>
            <h2>{headline}</h2>
            <p>{listing.address ?? "Address still missing"}</p>
          </div>
          <button type="button" className="deck-close" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="detail-modal-grid">
          <div className="detail-panel">
            <strong>Snapshot</strong>
            <div className="compare-stat-list">
              <span>Price: {listing.price ? `$${listing.price.toLocaleString()}` : "unknown"}</span>
              <span>Bedrooms: {listing.bedrooms !== null ? listing.bedrooms : "unknown"}</span>
              <span>Bathrooms: {listing.bathrooms !== null ? listing.bathrooms : "unknown"}</span>
              <span>Square feet: {listing.squareFeet !== null ? listing.squareFeet : "unknown"}</span>
              <span>Commute: {formatCommuteSnippet(commute)}</span>
              <span>Source: {listing.source}</span>
              <span>Status: {listing.status}</span>
            </div>
            {listing.sourceUrl ? (
              <a href={listing.sourceUrl} target="_blank" rel="noreferrer">
                Open original source
              </a>
            ) : null}
          </div>

          <div className="detail-panel">
            <strong>Tradeoff read</strong>
            <p>{boardListing.aiTradeoffAnalysis ?? boardListing.aiSummary ?? "No saved board analysis yet."}</p>
            {boardListing.aiRedFlags.length > 0 ? (
              <div className="detail-chip-wrap">
                {boardListing.aiRedFlags.map((flag) => (
                  <span key={flag} className="saved-pill">{flag}</span>
                ))}
              </div>
            ) : null}
            {boardListing.questionsToAsk.length > 0 ? (
              <>
                <strong>Questions to ask</strong>
                <ul className="detail-list">
                  {boardListing.questionsToAsk.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>

          <div className="detail-panel">
            <strong>Amenities</strong>
            {listing.amenities.length > 0 ? (
              <div className="detail-chip-wrap">
                {listing.amenities.map((amenity) => (
                  <span key={amenity} className="saved-pill">{amenity}</span>
                ))}
              </div>
            ) : (
              <p>No amenities listed yet.</p>
            )}
            <strong>Fees and unknowns</strong>
            {feeEntries.length > 0 ? (
              <ul className="detail-list">
                {feeEntries.map(([key, value]) => (
                  <li key={key}>{key}: {String(value)}</li>
                ))}
              </ul>
            ) : (
              <p>Fees are still mostly unknown.</p>
            )}
          </div>

          <div className="detail-panel">
            <strong>Roommate reactions</strong>
            <VoteSummary votes={votes} />
            <CommentFeed comments={comments} />
            <strong>Listing note</strong>
            <p>{listing.description ?? "No description saved for this listing yet."}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
