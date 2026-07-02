import "server-only";

type MaybeUser = {
  email?: string | null;
};

function getOperatorEmails() {
  return String(process.env.HOMEBOARD_OPERATOR_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isOperatorUser(user: MaybeUser | null | undefined) {
  if (!user?.email) return false;

  const operatorEmails = getOperatorEmails();
  if (operatorEmails.length === 0) {
    return process.env.NODE_ENV !== "production";
  }

  return operatorEmails.includes(user.email.trim().toLowerCase());
}
