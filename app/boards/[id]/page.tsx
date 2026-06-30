import { notFound, redirect } from "next/navigation";

import { BoardExperience } from "@/components/board-experience";
import { getCurrentAppUser } from "@/lib/auth";
import { isAppEnabled } from "@/lib/app-mode";
import { getBoardPageData, getRecentBoardsForUser } from "@/lib/board-data";

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  if (!isAppEnabled()) {
    redirect("/?notice=The%20live%20board%20experience%20is%20currently%20gated%20outside%20dev%20mode.");
  }
  const currentUser = await getCurrentAppUser();
  if (!currentUser) {
    redirect(`/?next=${encodeURIComponent(`/boards/${id}`)}`);
  }

  const data = await getBoardPageData(id, currentUser.id);

  if (!data) {
    notFound();
  }

  const notice = typeof resolvedSearchParams.notice === "string" ? resolvedSearchParams.notice : null;
  const error = typeof resolvedSearchParams.error === "string" ? resolvedSearchParams.error : null;
  const forceMemberSetup = resolvedSearchParams.memberSetup === "1";

  return (
    <BoardExperience
      currentUser={currentUser}
      data={data}
      recentBoards={await getRecentBoardsForUser(currentUser.id, 10)}
      notice={notice}
      error={error}
      forceMemberSetup={forceMemberSetup}
    />
  );
}
