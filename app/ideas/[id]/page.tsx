import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { AppShell } from "@/components/app-shell";
import { IdeaDetail } from "./idea-detail";
import {
  AI_ROLES,
  type AiRole,
  type ChatTurn,
  type Hypothesis,
  type Idea,
  type Prediction,
  type Validation,
} from "../types";

export const dynamic = "force-dynamic";

export default async function IdeaDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user!.id;

  const { data: idea } = await supabaseAdmin
    .from("ideas")
    .select("id, user_id, title, status, tags, hypothesis, created_at, last_activity_at")
    .eq("id", params.id)
    .maybeSingle();

  if (!idea || idea.user_id !== userId) notFound();

  // 各角色的既有对话
  const { data: sessions } = await supabaseAdmin
    .from("ai_sessions")
    .select("role, messages")
    .eq("idea_id", params.id)
    .in(
      "role",
      AI_ROLES.map((r) => r.key)
    );

  const initialChats = {} as Record<AiRole, ChatTurn[]>;
  for (const r of AI_ROLES) initialChats[r.key] = [];
  for (const s of sessions ?? []) {
    if (Array.isArray(s.messages)) {
      initialChats[s.role as AiRole] = s.messages as ChatTurn[];
    }
  }

  // 验证记录（倒序）
  const { data: validations } = await supabaseAdmin
    .from("validations")
    .select("id, has_pain, will_pay, note, contacted_at")
    .eq("idea_id", params.id)
    .order("contacted_at", { ascending: false });

  // 预测（倒序）
  const { data: predictions } = await supabaseAdmin
    .from("predictions")
    .select("id, text, due_at, made_at, outcome, resolved_at, note")
    .eq("idea_id", params.id)
    .order("made_at", { ascending: false });

  const ideaCore: Idea = {
    id: idea.id,
    title: idea.title,
    status: idea.status,
    tags: idea.tags ?? [],
    created_at: idea.created_at,
    last_activity_at: idea.last_activity_at,
  };

  return (
    <AppShell>
      <main className="animate-fade-up mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <IdeaDetail
          idea={ideaCore}
          hypothesis={(idea.hypothesis ?? {}) as Hypothesis}
          initialChats={initialChats}
          initialValidations={(validations ?? []) as Validation[]}
          initialPredictions={(predictions ?? []) as Prediction[]}
        />
      </main>
    </AppShell>
  );
}
