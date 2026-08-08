import "server-only";

import { syncAuthUserToProfile } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

function readBearerToken(request: Request) {
  const header = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token?.trim()) return null;
  return token.trim();
}

export async function getMobileAppUser(request: Request) {
  const token = readBearerToken(request);
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return syncAuthUserToProfile(data.user);
}

export async function requireMobileAppUser(request: Request) {
  const user = await getMobileAppUser(request);
  if (!user) throw new Error("MOBILE_AUTH_REQUIRED");
  return user;
}
