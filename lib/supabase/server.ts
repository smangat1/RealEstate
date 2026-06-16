import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function getSupabaseUrl() {
  const value = process.env.SUPABASE_URL;
  if (!value) throw new Error("Missing SUPABASE_URL");
  return value;
}

function getSupabasePublishableKey() {
  const value = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!value) throw new Error("Missing SUPABASE_PUBLISHABLE_KEY");
  return value;
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          cookieStore.set(cookie.name, cookie.value, cookie.options);
        }
      },
    },
  });
}
