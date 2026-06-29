import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only admin client backed by the service role key.
 *
 * Per the project constitution, all DB queries go through this client while the
 * product is single-user (RLS is effectively bypassed for now). NEVER import
 * this module from a Client Component — the service role key must never reach
 * the browser.
 *
 * Lazily initialized so that importing this module at build time (during
 * Next.js page-data collection) does not throw when env vars are absent.
 * The error is deferred until the first actual DB call at runtime.
 */
let _client: SupabaseClient | null = null;

function getAdmin(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local."
      );
    }
    _client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _client;
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_, prop: string | symbol) {
    const client = getAdmin();
    const val = (client as unknown as Record<string | symbol, unknown>)[prop];
    return typeof val === "function"
      ? (val as (...args: unknown[]) => unknown).bind(client)
      : val;
  },
});
