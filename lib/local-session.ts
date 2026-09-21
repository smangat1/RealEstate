import "server-only";

import { cookies } from "next/headers";

export const LOCAL_USER_COOKIE = "homeboard_user_id";
export const LEGACY_LOCAL_USER_COOKIE = "rental_advisor_user_id";

export async function getCurrentUserIdFromSession() {
  const cookieStore = await cookies();
  return cookieStore.get(LOCAL_USER_COOKIE)?.value ?? cookieStore.get(LEGACY_LOCAL_USER_COOKIE)?.value ?? null;
}

export async function setCurrentUserIdInSession(userId: string) {
  (await cookies()).set(LOCAL_USER_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearCurrentUserIdFromSession() {
  const cookieStore = await cookies();
  cookieStore.set(LOCAL_USER_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  cookieStore.set(LEGACY_LOCAL_USER_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
