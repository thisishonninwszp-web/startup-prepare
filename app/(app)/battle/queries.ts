import { supabaseAdmin } from "@/lib/supabase";
import type { BattleSessionRow } from "./types";

const SESSION_COLUMNS =
  "id, idea_id, claim, messages, recap, final_position, learned, status, created_at, concluded_at";

export async function getBattleSession(
  sessionId: string,
  userId: string
): Promise<BattleSessionRow | null> {
  const { data, error } = await supabaseAdmin
    .from("battle_sessions")
    .select(SESSION_COLUMNS)
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as BattleSessionRow | null) ?? null;
}

export async function listBattleSessions(userId: string): Promise<BattleSessionRow[]> {
  const { data, error } = await supabaseAdmin
    .from("battle_sessions")
    .select(SESSION_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as BattleSessionRow[];
}
