import { supabaseAdmin } from "@/lib/supabase";
import type {
  CouncilMessage,
  CouncilPersona,
  CouncilSession,
  CouncilSessionPersona,
  CouncilSessionWithMessages,
} from "./types";

export async function listCouncilPersonas(userId: string): Promise<CouncilPersona[]> {
  const { data, error } = await supabaseAdmin
    .from("council_personas")
    .select("key, display_name, is_builtin, category, grounding_note, owner_user_id")
    .or(`is_builtin.eq.true,owner_user_id.eq.${userId}`)
    .order("is_builtin", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("列出顾问人物失败", error.message);
    throw new Error("读取数据失败，请重试");
  }
  return (data ?? []).map((p) => ({
    key: p.key,
    display_name: p.display_name,
    is_builtin: p.is_builtin,
    category: p.category ?? "自定义",
    grounding_note: p.grounding_note,
    owner_user_id: p.owner_user_id ?? null,
  }));
}

export async function listCouncilSessions(userId: string): Promise<CouncilSession[]> {
  const { data, error } = await supabaseAdmin
    .from("council_sessions")
    .select("id, user_id, idea_id, title, created_at")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("列出顾问团会话失败", error.message);
    throw new Error("读取数据失败，请重试");
  }
  return (data ?? []).map((s) => ({
    id: s.id,
    user_id: s.user_id,
    idea_id: s.idea_id ?? null,
    title: s.title,
    created_at: s.created_at,
  }));
}

export type SharpestQuestionEntry = {
  id: string;
  session_id: string;
  session_title: string;
  persona_key: string;
  persona_name: string;
  grounded_reference: string;
  question: string;
  created_at: string;
};

/** 跨全部会话汇总每位顾问抛出的“最犀利提问”，供提问墙陈列。 */
export async function listSharpestQuestions(
  userId: string
): Promise<SharpestQuestionEntry[]> {
  const [messagesResult, personas] = await Promise.all([
    supabaseAdmin
      .from("council_messages")
      .select(
        "id, session_id, persona_key, grounded_reference, sharpest_question, created_at, council_sessions!inner(user_id, title)"
      )
      .eq("council_sessions.user_id", userId)
      .not("sharpest_question", "is", null)
      .order("created_at", { ascending: false })
      .limit(200),
    listCouncilPersonas(userId),
  ]);
  if (messagesResult.error) {
    console.error("读取犀利提问失败", messagesResult.error.message);
    throw new Error("读取数据失败，请重试");
  }
  const nameByKey = new Map(personas.map((p) => [p.key, p.display_name]));

  return (messagesResult.data ?? [])
    .filter(
      (m) =>
        typeof m.sharpest_question === "string" &&
        m.sharpest_question.trim().length > 0 &&
        m.persona_key
    )
    .map((m) => {
      const sessionRel = m.council_sessions as unknown;
      const session = Array.isArray(sessionRel) ? sessionRel[0] : sessionRel;
      return {
        id: m.id as string,
        session_id: m.session_id as string,
        session_title:
          ((session as { title?: string } | null)?.title as string) || "未命名会话",
        persona_key: m.persona_key as string,
        persona_name: nameByKey.get(m.persona_key as string) ?? m.persona_key,
        grounded_reference: (m.grounded_reference as string) ?? "",
        question: (m.sharpest_question as string).trim(),
        created_at: m.created_at as string,
      };
    });
}

export async function getCouncilSession(
  sessionId: string,
  userId: string
): Promise<CouncilSessionWithMessages | null> {
  const { data: session, error } = await supabaseAdmin
    .from("council_sessions")
    .select("id, user_id, idea_id, title, created_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) {
    console.error("读取顾问团会话失败", error.message);
    throw new Error("读取数据失败，请重试");
  }
  if (!session || session.user_id !== userId) return null;

  const { data: personasData, error: personasError } = await supabaseAdmin
    .from("council_session_personas")
    .select("persona_key, turns_since_last_spoke")
    .eq("session_id", sessionId);
  if (personasError) {
    console.error("读取会话顾问名单失败", personasError.message);
    throw new Error("读取数据失败，请重试");
  }

  const { data: messagesData, error: messagesError } = await supabaseAdmin
    .from("council_messages")
    .select(
      "id, session_id, role, persona_key, grounded_reference, content, sharpest_question, created_at"
    )
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (messagesError) {
    console.error("读取顾问团消息失败", messagesError.message);
    throw new Error("读取数据失败，请重试");
  }

  const personas: CouncilSessionPersona[] = (personasData ?? []).map((p) => ({
    persona_key: p.persona_key,
    turns_since_last_spoke: p.turns_since_last_spoke,
  }));

  const messages: CouncilMessage[] = (messagesData ?? []).map((m) => ({
    id: m.id,
    session_id: m.session_id,
    role: m.role as "user" | "persona",
    persona_key: m.persona_key ?? null,
    grounded_reference: m.grounded_reference,
    content: m.content,
    sharpest_question: m.sharpest_question ?? null,
    created_at: m.created_at,
  }));

  return {
    id: session.id,
    user_id: session.user_id,
    idea_id: session.idea_id ?? null,
    title: session.title,
    created_at: session.created_at,
    personas,
    messages,
  };
}
