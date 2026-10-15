export function isAdvisorPushEnabled(value = process.env.HOMEBOARD_ADVISOR_ENABLED) {
  return value === "true";
}
