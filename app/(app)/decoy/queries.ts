import { supabaseAdmin } from "@/lib/supabase";
import type { DecoySessionRow } from "./types";

const SESSION_COLUMNS =
  "id, idea_id, problem, plan, challenges, reveal, own_plan, own_plan_critique, final_plan, learned, status, created_at, revealed_at, concluded_at";

export async function getDecoySession(
  sessionId: string,
  userId: string
): Promise<DecoySessionRow | null> {
  const { data, error } = await supabaseAdmin
    .from("decoy_sessions")
    .select(SESSION_COLUMNS)
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DecoySessionRow | null) ?? null;
}

export async function listDecoySessions(userId: string): Promise<DecoySessionRow[]> {
  const { data, error } = await supabaseAdmin
    .from("decoy_sessions")
    .select(SESSION_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as DecoySessionRow[];
}
