import { supabaseAdmin } from "@/lib/supabase";
import { parseRealityMap } from "./types";
import {
  parseRealityFocusResponse,
  resolveRealityFocusAnchor,
  type RealityFocusAnchor,
  type RealityFocusLocator,
  type RealityFocusMessage,
  type RealityFocusSession,
  type RealityFocusSummary,
} from "./focus";

function missingFocusSchema(error: { code?: string; message?: string }) {
  return (
    error.code === "PGRST205" &&
    Boolean(
      error.message?.includes("reality_focus_sessions") ||
        error.message?.includes("reality_focus_messages")
    )
  );
}

export async function getRealityFocusSchemaStatus(): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("reality_focus_sessions")
    .select("id")
    .limit(1);
  if (!error) return true;
  if (missingFocusSchema(error)) return false;
  throw new Error(error.message);
}

export async function loadOwnedFocusAnchor(
  caseId: string,
  versionId: string,
  userId: string,
  locator: RealityFocusLocator
): Promise<{ anchor: RealityFocusAnchor; map: ReturnType<typeof parseRealityMap> } | null> {
  const { data, error } = await supabaseAdmin
    .from("reality_versions")
    .select("id, case_id, map, reality_cases!inner(user_id)")
    .eq("id", versionId)
    .eq("case_id", caseId)
    .eq("reality_cases.user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const relation = Array.isArray(data.reality_cases)
    ? data.reality_cases[0]
    : data.reality_cases;
  if (!relation || relation.user_id !== userId) return null;
  const map = parseRealityMap(data.map);
  return { anchor: resolveRealityFocusAnchor(map, locator), map };
}

function parseMessage(row: Record<string, unknown>): RealityFocusMessage {
  if (row.role !== "user" && row.role !== "assistant" && row.role !== "safety") {
    throw new Error("聚焦探索消息角色无效");
  }
  return {
    id: String(row.id),
    role: row.role,
    turn_no: Number(row.turn_no),
    client_key:
      typeof row.client_key === "string" ? row.client_key : null,
    content:
      row.role === "assistant"
        ? parseRealityFocusResponse(row.content)
        : row.content,
    created_at: String(row.created_at),
  };
}

function parseSession(row: Record<string, unknown>): RealityFocusSession {
  if (
    row.status !== "open" &&
    row.status !== "completed" &&
    row.status !== "safety_stopped"
  ) {
    throw new Error("聚焦探索状态无效");
  }
  const anchor = row.anchor_snapshot as RealityFocusAnchor;
  const messages = Array.isArray(row.reality_focus_messages)
    ? row.reality_focus_messages
        .map((item) => parseMessage(item as Record<string, unknown>))
        .sort(
          (a, b) =>
            a.turn_no - b.turn_no ||
            a.created_at.localeCompare(b.created_at)
        )
    : [];
  return {
    id: String(row.id),
    case_id: String(row.case_id),
    version_id: String(row.version_id),
    anchor,
    status: row.status,
    summary: (row.summary as RealityFocusSummary | null) ?? null,
    include_in_closure: Boolean(row.include_in_closure),
    include_in_next_version: Boolean(row.include_in_next_version),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    messages,
  };
}

const SESSION_SELECT =
  "id, case_id, version_id, anchor_snapshot, status, summary, include_in_closure, include_in_next_version, created_at, updated_at, reality_focus_messages(id, role, turn_no, client_key, content, created_at)";

export async function listRealityFocusSessions(
  caseId: string,
  userId: string
): Promise<RealityFocusSession[]> {
  const { data, error } = await supabaseAdmin
    .from("reality_focus_sessions")
    .select(SESSION_SELECT)
    .eq("user_id", userId)
    .eq("case_id", caseId)
    .order("created_at", { ascending: false });
  if (error) {
    if (missingFocusSchema(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((row) =>
    parseSession(row as unknown as Record<string, unknown>)
  );
}

export async function getRealityFocusSession(
  sessionId: string,
  userId: string
): Promise<RealityFocusSession | null> {
  const { data, error } = await supabaseAdmin
    .from("reality_focus_sessions")
    .select(SESSION_SELECT)
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data
    ? parseSession(data as unknown as Record<string, unknown>)
    : null;
}

export type FocusExportSnapshot = {
  id: string;
  anchor: RealityFocusAnchor;
  summary: RealityFocusSummary;
};

export async function listFocusExportsForClosure(
  caseId: string,
  versionId: string,
  userId: string
): Promise<FocusExportSnapshot[]> {
  const { data, error } = await supabaseAdmin
    .from("reality_focus_sessions")
    .select("id, anchor_snapshot, summary")
    .eq("user_id", userId)
    .eq("case_id", caseId)
    .eq("version_id", versionId)
    .eq("status", "completed")
    .eq("include_in_closure", true);
  if (error) {
    if (missingFocusSchema(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    anchor: row.anchor_snapshot as RealityFocusAnchor,
    summary: row.summary as RealityFocusSummary,
  }));
}

export async function listUnconsumedFocusExports(
  caseId: string,
  userId: string
): Promise<FocusExportSnapshot[]> {
  const [{ data: sessions, error }, { data: versions, error: versionsError }] =
    await Promise.all([
      supabaseAdmin
        .from("reality_focus_sessions")
        .select("id, anchor_snapshot, summary")
        .eq("user_id", userId)
        .eq("case_id", caseId)
        .eq("status", "completed")
        .eq("include_in_next_version", true),
      supabaseAdmin
        .from("reality_versions")
        .select("focus_session_ids")
        .eq("case_id", caseId),
    ]);
  if (error) {
    if (missingFocusSchema(error)) return [];
    throw new Error(error.message);
  }
  if (versionsError) throw new Error(versionsError.message);
  const consumed = new Set(
    (versions ?? []).flatMap((row) =>
      Array.isArray(row.focus_session_ids)
        ? (row.focus_session_ids as string[])
        : []
    )
  );
  return (sessions ?? [])
    .filter((row) => !consumed.has(row.id as string))
    .map((row) => ({
      id: row.id as string,
      anchor: row.anchor_snapshot as RealityFocusAnchor,
      summary: row.summary as RealityFocusSummary,
    }));
}
