import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser (Client Component) Supabase client used for Auth.
 * Uses the public anon key — safe to ship to the browser.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
