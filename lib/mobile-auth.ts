import "server-only";

import { auth, syncAuthUserToProfile } from "@/lib/auth";
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
  if (token) {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (!error && data.user) {
      return syncAuthUserToProfile(data.user);
    }
  }
  const session = await auth();
  if (session?.user?.id) {
    return {
      id: session.user.id,
      email: session.user.email ?? "",
      name: session.user.name ?? "",
    };
  }
  return null;
}

export async function requireMobileAppUser(request: Request) {
  const user = await getMobileAppUser(request);
  if (!user) throw new Error("MOBILE_AUTH_REQUIRED");
  return user;
}
