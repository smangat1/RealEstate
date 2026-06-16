import "server-only";

import { createClient } from "@supabase/supabase-js";

function getSupabaseUrl() {
  const value = process.env.SUPABASE_URL;
  if (!value) throw new Error("Missing SUPABASE_URL");
  return value;
}

function getSupabaseSecretKey() {
  const value = process.env.SUPABASE_SECRET_KEY;
  if (!value) throw new Error("Missing SUPABASE_SECRET_KEY");
  return value;
}

export const supabaseAdmin = createClient(getSupabaseUrl(), getSupabaseSecretKey(), {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
