export const DEMO_BOARD_TITLE = "Demo Board";
export const DEMO_OWNER_DISPLAY_NAME = "App Review";
export const DEMO_OWNER_EMAIL = "app-review@joinhomeboard.com";
export const DEMO_ROOMMATE_USER_ID = "app-review-demo-roommate";
export const DEMO_ROOMMATE_DISPLAY_NAME = "Demo Roommate";

export const DEMO_ROOMMATE_MESSAGES = [
  {
    id: "app-review-demo-roommate-message-1",
    content: "Hi! I am the fictional demo roommate. I can help compare the saved listings.",
  },
  {
    id: "app-review-demo-roommate-message-2",
    content: "The light and commute notes look useful. Thanks for adding them.",
  },
  {
    id: "app-review-demo-roommate-message-3",
    content: "I am happy to review options together before the next tour.",
  },
] as const;

type DemoBoardIdentity = {
  title: string;
  owner: {
    displayName: string;
    email: string | null;
  };
  invitation: {
    boardId: string;
    invitedByUserId: string;
    status: string;
  };
  boardId: string;
  ownerUserId: string;
};

export function assertExpectedDemoBoard(identity: DemoBoardIdentity) {
  if (identity.title !== DEMO_BOARD_TITLE) {
    throw new Error(`Refusing: expected board title ${JSON.stringify(DEMO_BOARD_TITLE)}.`);
  }
  if (
    identity.owner.displayName !== DEMO_OWNER_DISPLAY_NAME
    || identity.owner.email?.toLowerCase() !== DEMO_OWNER_EMAIL
  ) {
    throw new Error(
      `Refusing: expected ${DEMO_OWNER_DISPLAY_NAME} (${DEMO_OWNER_EMAIL}) to own the demo board.`,
    );
  }
  if (
    identity.invitation.boardId !== identity.boardId
    || identity.invitation.invitedByUserId !== identity.ownerUserId
    || identity.invitation.status !== "pending"
  ) {
    throw new Error("Refusing: the reusable review invitation does not match the demo board owner.");
  }
}

export function demoRoommateRows(boardId: string) {
  return {
    user: {
      id: DEMO_ROOMMATE_USER_ID,
      authUserId: null,
      email: null,
      displayName: DEMO_ROOMMATE_DISPLAY_NAME,
      isDemoAccount: true,
    },
    membership: {
      boardId,
      userId: DEMO_ROOMMATE_USER_ID,
      role: "member" as const,
    },
    roommateProfile: {
      boardId,
      linkedUserId: DEMO_ROOMMATE_USER_ID,
      name: DEMO_ROOMMATE_DISPLAY_NAME,
      roleLabel: "roommate",
      commutePriority: "medium" as const,
      neighborhoodPriority: "medium" as const,
      spacePriority: "medium" as const,
      privacyPriority: "medium" as const,
      preferredNeighborhoods: "[]",
      mustHaves: "[]",
      dealbreakers: "[]",
    },
    messages: DEMO_ROOMMATE_MESSAGES.map((message) => ({
      ...message,
      boardId,
      role: "user" as const,
      authorUserId: DEMO_ROOMMATE_USER_ID,
      authorName: DEMO_ROOMMATE_DISPLAY_NAME,
    })),
  };
}
