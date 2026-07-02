import "server-only";

export function shouldNoIndexSite() {
  const override = process.env.HOMEBOARD_NOINDEX?.trim().toLowerCase();
  if (override === "false") return false;
  if (override === "true") return true;
  return true;
}
