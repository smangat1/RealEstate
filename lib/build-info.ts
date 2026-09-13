import "server-only";

import packageMetadata from "@/package.json";

export const API_VERSION = packageMetadata.version;

export function getServerCommit() {
  const candidates = [
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.GIT_COMMIT_SHA,
    process.env.SOURCE_VERSION,
  ];
  const commit = candidates.find((value) => /^[a-f0-9]{7,40}$/i.test(value?.trim() ?? ""));
  return commit?.trim().slice(0, 12) ?? "local";
}
