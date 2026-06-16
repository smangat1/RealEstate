export function isAppEnabled() {
  const override = process.env.ENABLE_APP?.trim().toLowerCase();
  if (override === "true") return true;
  if (override === "false") return false;
  return process.env.NODE_ENV === "development";
}
