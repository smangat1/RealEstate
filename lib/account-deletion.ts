import "server-only";

import type { Prisma } from "@prisma/client";

import { LISTING_IMAGE_BUCKET, listingImageStoragePath } from "@/lib/listing-image-urls";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase/admin";

type AccountDeletionPlan = {
  userId: string;
  relatedBoardIds: string[];
  ownedBoardIds: string[];
  ownedListingIds: string[];
  roommateProfileIds: string[];
  actorNames: string[];
  imageListings: Array<{ id: string; images: string | null }>;
};

function unique(values: string[]) {
  return [...new Set(values)];
}

function isMissingBucket(error: { message?: string; statusCode?: string | number } | null) {
  if (!error) return false;
  return error.statusCode === "404"
    || error.statusCode === 404
    || /bucket.+not found|not found.+bucket/i.test(error.message ?? "");
}

async function listStorageDirectory(prefix: string) {
  const objects: Array<{ id?: string | null; name: string }> = [];
  let offset = 0;
  const limit = 1_000;

  while (objects.length < 10_000) {
    const { data, error } = await supabaseAdmin.storage
      .from(LISTING_IMAGE_BUCKET)
      .list(prefix, { limit, offset, sortBy: { column: "name", order: "asc" } });
    if (isMissingBucket(error)) return [];
    if (error) throw error;
    const page = data ?? [];
    objects.push(...page);
    if (page.length < limit) break;
    offset += page.length;
  }

  return objects;
}

async function collectStorageFiles(prefix: string, depth = 0): Promise<string[]> {
  if (depth > 3) return [];
  const objects = await listStorageDirectory(prefix);
  const paths: string[] = [];

  for (const object of objects) {
    const path = `${prefix}/${object.name}`;
    if (object.id) paths.push(path);
    else paths.push(...await collectStorageFiles(path, depth + 1));
  }

  return paths;
}

export function stripAccountUploadUrls(
  images: string | null,
  userId: string,
  boardIds: string[],
) {
  if (!images) return images;
  let parsed: unknown;
  try {
    parsed = JSON.parse(images);
  } catch {
    return images;
  }
  if (!Array.isArray(parsed)) return images;

  const boardIdSet = new Set(boardIds);
  const filtered = parsed.filter((value) => {
    if (typeof value !== "string") return true;
    const path = listingImageStoragePath(value);
    if (!path) return true;
    const [first, second] = path.split("/");
    return !(first === userId && boardIdSet.has(second))
      && !(second === userId && boardIdSet.has(first));
  });

  return filtered.length === parsed.length ? images : JSON.stringify(filtered);
}

export async function prepareAccountDeletion(userId: string): Promise<AccountDeletionPlan> {
  const [ownedBoards, relatedBoards, roommateProfiles, user] = await Promise.all([
    prisma.searchBoard.findMany({
      where: { userId },
      select: {
        id: true,
        boardListings: { select: { listingId: true } },
      },
    }),
    prisma.searchBoard.findMany({
      where: {
        OR: [
          { userId },
          { members: { some: { userId } } },
          { roommates: { some: { linkedUserId: userId } } },
        ],
      },
      select: { id: true },
    }),
    prisma.roommateProfile.findMany({
      where: { linkedUserId: userId },
      select: { id: true, name: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } }),
  ]);

  const relatedBoardIds = unique(relatedBoards.map((board) => board.id));
  const imageListings = relatedBoardIds.length === 0
    ? []
    : await prisma.listing.findMany({
        where: {
          images: { not: null },
          boardListings: { some: { boardId: { in: relatedBoardIds } } },
        },
        select: { id: true, images: true },
      });

  return {
    userId,
    relatedBoardIds,
    ownedBoardIds: ownedBoards.map((board) => board.id),
    ownedListingIds: unique(
      ownedBoards.flatMap((board) => board.boardListings.map((item) => item.listingId)),
    ),
    roommateProfileIds: roommateProfiles.map((profile) => profile.id),
    actorNames: unique([
      user?.displayName ?? "",
      ...roommateProfiles.map((profile) => profile.name),
    ].filter(Boolean)),
    imageListings,
  };
}

export async function deleteAccountListingImages(plan: AccountDeletionPlan) {
  const paths = new Set(await collectStorageFiles(plan.userId));
  for (const boardId of plan.relatedBoardIds) {
    const legacyPaths = await collectStorageFiles(`${boardId}/${plan.userId}`);
    legacyPaths.forEach((path) => paths.add(path));
  }

  const values = [...paths];
  for (let index = 0; index < values.length; index += 100) {
    const { error } = await supabaseAdmin.storage
      .from(LISTING_IMAGE_BUCKET)
      .remove(values.slice(index, index + 100));
    if (isMissingBucket(error)) return;
    if (error) throw error;
  }
}

export async function deleteAccountApplicationData(plan: AccountDeletionPlan) {
  const analyticsFilters: Prisma.AnalyticsEventWhereInput[] = [
    { payload: { path: ["userId"], equals: plan.userId } },
    ...plan.ownedBoardIds.map((boardId) => ({
      payload: { path: ["boardId"], equals: boardId },
    })),
  ];

  await prisma.$transaction(async (transaction) => {
    for (const listing of plan.imageListings) {
      const images = stripAccountUploadUrls(
        listing.images,
        plan.userId,
        plan.relatedBoardIds,
      );
      if (images !== listing.images) {
        await transaction.listing.update({
          where: { id: listing.id },
          data: { images },
        });
      }
    }

    await transaction.chatMessage.deleteMany({ where: { authorUserId: plan.userId } });
    if (plan.relatedBoardIds.length > 0 && plan.actorNames.length > 0) {
      await transaction.boardEvent.deleteMany({
        where: {
          boardId: { in: plan.relatedBoardIds },
          OR: [
            { actorName: { in: plan.actorNames } },
            ...plan.actorNames.map((name) => ({ content: { contains: name } })),
          ],
        },
      });
    }
    await transaction.analyticsEvent.deleteMany({ where: { OR: analyticsFilters } });

    if (plan.roommateProfileIds.length > 0) {
      await transaction.boardListingSource.deleteMany({
        where: { createdByRoommateId: { in: plan.roommateProfileIds } },
      });
      await transaction.boardListingVerification.deleteMany({
        where: { roommateId: { in: plan.roommateProfileIds } },
      });
      await transaction.roommateProfile.deleteMany({
        where: { id: { in: plan.roommateProfileIds } },
      });
    }

    await transaction.user.delete({ where: { id: plan.userId } });

    if (plan.ownedListingIds.length > 0) {
      await transaction.listing.deleteMany({
        where: {
          id: { in: plan.ownedListingIds },
          boardListings: { none: {} },
        },
      });
    }
  });
}
