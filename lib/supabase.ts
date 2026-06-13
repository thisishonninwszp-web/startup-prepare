import { createClient } from "@supabase/supabase-js";

/**
 * Server-only admin client backed by the service role key.
 *
 * Per the project constitution, all DB queries go through this client while the
 * product is single-user (RLS is effectively bypassed for now). NEVER import
 * this module from a Client Component — the service role key must never reach
 * the browser.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local."
  );
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
