"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  generateOutreachStrategy,
  challengeOutreachDimension,
  polishOutreachDraft,
  type OutreachStrategy,
} from "@/lib/ai";
import type { UseCase, Dim, AiChallenge } from "@/app/(app)/outreach/types";
import { getRelevantKnowledgeCards } from "@/app/(app)/knowledge/queries";
import { parseCustomerProxy } from "@/app/(app)/customer-view/types";
import type { Hypothesis } from "@/app/(app)/ideas/types";

async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  return user.id;
}

function renderHypothesisSummary(h: Hypothesis): string {
  const parts: string[] = [];
  if (h.target_user) parts.push(`目标用户：${h.target_user}`);
  if (h.pain) parts.push(`痛苦：${h.pain}`);
  if (h.solution) parts.push(`解决方案：${h.solution}`);
  if (h.willingness_to_pay) parts.push(`支付意愿：${h.willingness_to_pay}`);
  if (h.riskiest_assumption) parts.push(`最关键假设：${h.riskiest_assumption}`);
  return parts.join("\n");
}

function renderKnowledgeCards(
  cards: { card_type: string; content: string }[]
): string {
  const TYPE_LABEL: Record<string, string> = {
    market: "市场事实",
    customer: "顾客规律",
    judgment: "判断历史",
    domain: "领域知识",
  };
  return cards
    .map((c) => `[${TYPE_LABEL[c.card_type] ?? c.card_type}] ${c.content}`)
    .join("\n");
}

// ── 创业场景：idea → 触达策略 ─────────────────────────────────────────────────

export async function generateIdeaOutreachStrategy(
  ideaId: string
): Promise<OutreachStrategy> {
  const userId = await requireUserId();

  // 1. 加载假设
  const { data: idea } = await supabaseAdmin
    .from("ideas")
    .select("user_id, hypothesis, tags")
    .eq("id", ideaId)
    .maybeSingle();
  if (!idea || idea.user_id !== userId) throw new Error("无权访问该想法");

  const hypothesis = (idea.hypothesis ?? {}) as Hypothesis;
  const ideaTags = (idea.tags as string[] | null) ?? [];

  // 2. 取最新客户代理（如果有与此 idea 关联的 customer case）
  let targetDescription = "";
  const { data: cases } = await supabaseAdmin
    .from("customer_cases")
    .select("id")
    .eq("idea_id", ideaId)
    .eq("user_id", userId)
    .limit(1);
  if (cases && cases.length > 0) {
    const caseId = cases[0].id;
    const { data: versions } = await supabaseAdmin
      .from("customer_proxy_versions")
      .select("proxy, selected_segment")
      .eq("case_id", caseId)
      .order("version_no", { ascending: false })
      .limit(1);
    if (versions && versions.length > 0) {
      try {
        const proxy = parseCustomerProxy(versions[0].proxy);
        const parts: string[] = [];
        if (proxy.who) parts.push(`人物：${proxy.who}`);
        if (proxy.desired_progress?.length)
          parts.push(`想达成：${proxy.desired_progress.join("；")}`);
        if (proxy.current_alternatives?.length)
          parts.push(`现在用：${proxy.current_alternatives.join("；")}`);
        if (proxy.own_words?.length)
          parts.push(`用他们自己的话：${proxy.own_words.map((w) => w.quote).join("；")}`);
        if (proxy.unknowns?.length)
          parts.push(`仍不确定：${proxy.unknowns.join("；")}`);
        targetDescription = parts.join("\n");
      } catch {
        // proxy parse 失败，退回空
      }
    }
  }

  // 如果没有客户代理，用假设中的 target_user 和 pain
  if (!targetDescription) {
    const parts: string[] = [];
    if (hypothesis.target_user) parts.push(`目标用户：${hypothesis.target_user}`);
    if (hypothesis.pain) parts.push(`痛苦描述：${hypothesis.pain}`);
    targetDescription = parts.join("\n") || "（未填写目标用户信息）";
  }

  // 3. 相关知识卡片
  const hypothesisText = Object.values(hypothesis).filter(Boolean).join(" ");
  const keywords = [
    ...ideaTags,
    ...hypothesisText.split(/[\s,，、。；：！？]+/).filter((w) => w.length > 1),
  ];
  const knowledgeCards = await getRelevantKnowledgeCards(userId, keywords, 5);
  const knowledgeContext = renderKnowledgeCards(knowledgeCards);

  // 4. AI 质疑摘要（取 investor 或第一个角色的第一条 assistant 回复）
  let aiCritiqueSummary = "";
  const { data: sessions } = await supabaseAdmin
    .from("ai_sessions")
    .select("role, messages")
    .eq("idea_id", ideaId)
    .order("created_at", { ascending: true })
    .limit(4);
  if (sessions) {
    const firstCritique = sessions.find((s) => {
      if (!Array.isArray(s.messages)) return false;
      return (s.messages as { role: string }[]).some((m) => m.role === "assistant");
    });
    if (firstCritique) {
      const assistantMsg = (firstCritique.messages as { role: string; content: string }[]).find(
        (m) => m.role === "assistant"
      );
      if (assistantMsg) {
        aiCritiqueSummary = assistantMsg.content.slice(0, 500);
      }
    }
  }

  // 5. 生成策略
  const strategy = await generateOutreachStrategy({
    use_case: "idea_validation",
    hypothesis_or_goal: renderHypothesisSummary(hypothesis),
    target_description: targetDescription,
    knowledge_context: knowledgeContext,
    ai_critique_summary: aiCritiqueSummary || undefined,
  });

  // 6. 保存（覆盖已有的该 idea 策略）
  const { data: existing } = await supabaseAdmin
    .from("outreach_strategies")
    .select("id")
    .eq("idea_id", ideaId)
    .eq("use_case", "idea_validation")
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    await supabaseAdmin
      .from("outreach_strategies")
      .update({ strategy, created_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await supabaseAdmin.from("outreach_strategies").insert({
      user_id: userId,
      idea_id: ideaId,
      use_case: "idea_validation",
      strategy,
    });
  }

  return strategy;
}

// ── 求职场景：company → 求职触达策略 ─────────────────────────────────────────

export async function generateJobOutreachStrategy(
  companyId: string
): Promise<OutreachStrategy> {
  const userId = await requireUserId();

  // 1. 加载公司详情
  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("user_id, name, company_type, ceo_notes")
    .eq("id", companyId)
    .maybeSingle();
  if (!company || company.user_id !== userId) throw new Error("无权访问该公司档案");

  const { data: events } = await supabaseAdmin
    .from("company_events")
    .select("year, description, related_party")
    .eq("company_id", companyId)
    .order("year", { ascending: true, nullsFirst: false });

  // 2. 构建目标描述
  const targetParts: string[] = [`公司名：${company.name}`];
  if (company.ceo_notes) targetParts.push(`CEO/关键人思路：${company.ceo_notes}`);
  if (events && events.length > 0) {
    const timeline = events
      .map((e) => `${e.year ?? "？"}年 — ${e.description}${e.related_party ? `（${e.related_party}）` : ""}`)
      .join("\n");
    targetParts.push(`公司大事记：\n${timeline}`);
  }
  const targetDescription = targetParts.join("\n\n");

  // 3. 用户自身的 domain 类知识卡片（视为个人能力/经验）
  const { data: domainCards } = await supabaseAdmin
    .from("knowledge_cards")
    .select("content, card_type, tags")
    .eq("user_id", userId)
    .eq("card_type", "domain")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(6);

  // 也取 judgment 类（过去的判断模式，对自我认识有帮助）
  const { data: judgmentCards } = await supabaseAdmin
    .from("knowledge_cards")
    .select("content, card_type, tags")
    .eq("user_id", userId)
    .eq("card_type", "judgment")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(3);

  const knowledgeContext = renderKnowledgeCards([
    ...(domainCards ?? []),
    ...(judgmentCards ?? []),
  ]);

  // 4. 构建求职目标说明（用 hypothesis_or_goal 字段）
  const goal = `求职目标：在 ${company.name} 找到匹配的职位，展示我能为这家公司带来的价值。`;

  // 5. 生成策略
  const strategy = await generateOutreachStrategy({
    use_case: "job_search",
    hypothesis_or_goal: goal,
    target_description: targetDescription,
    knowledge_context: knowledgeContext,
  });

  // 6. 保存（覆盖）
  const { data: existing } = await supabaseAdmin
    .from("outreach_strategies")
    .select("id")
    .eq("company_id", companyId)
    .eq("use_case", "job_search")
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    await supabaseAdmin
      .from("outreach_strategies")
      .update({ strategy, created_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await supabaseAdmin.from("outreach_strategies").insert({
      user_id: userId,
      company_id: companyId,
      use_case: "job_search",
      strategy,
    });
  }

  return strategy;
}

// ── 加载已有策略 ───────────────────────────────────────────────────────────────

export async function getIdeaOutreachStrategy(
  ideaId: string
): Promise<OutreachStrategy | null> {
  const userId = await requireUserId();
  const { data } = await supabaseAdmin
    .from("outreach_strategies")
    .select("strategy")
    .eq("idea_id", ideaId)
    .eq("use_case", "idea_validation")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.strategy as OutreachStrategy | null;
}

export async function getCompanyOutreachStrategy(
  companyId: string
): Promise<OutreachStrategy | null> {
  const userId = await requireUserId();
  const { data } = await supabaseAdmin
    .from("outreach_strategies")
    .select("strategy")
    .eq("company_id", companyId)
    .eq("use_case", "job_search")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.strategy as OutreachStrategy | null;
}

// ── 触达画布 Canvas CRUD ──────────────────────────────────────────────────────

export async function createCanvas(params: {
  title: string;
  use_case: UseCase;
  scenario: string;
  source_id?: string;
  source_type?: "idea" | "company";
}): Promise<string> {
  const userId = await requireUserId();
  const { data, error } = await supabaseAdmin
    .from("outreach_canvases")
    .insert({
      user_id: userId,
      title: params.title,
      use_case: params.use_case,
      scenario: params.scenario,
      source_id: params.source_id ?? null,
      source_type: params.source_type ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function saveCanvasDimension(
  canvasId: string,
  dim: Dim,
  value: string
): Promise<void> {
  const userId = await requireUserId();
  const field =
    dim === "person"
      ? "person_notes"
      : dim === "place"
        ? "place_notes"
        : dim === "time"
          ? "time_notes"
          : "message_draft";
  const { error } = await supabaseAdmin
    .from("outreach_canvases")
    .update({ [field]: value, updated_at: new Date().toISOString() })
    .eq("id", canvasId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function saveCanvasScenario(
  canvasId: string,
  scenario: string
): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabaseAdmin
    .from("outreach_canvases")
    .update({ scenario, updated_at: new Date().toISOString() })
    .eq("id", canvasId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function challengeDimension(
  canvasId: string,
  dim: Dim,
  userNotes: string
): Promise<string> {
  const userId = await requireUserId();

  const { data: canvas } = await supabaseAdmin
    .from("outreach_canvases")
    .select("use_case, scenario, ai_challenges")
    .eq("id", canvasId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!canvas) throw new Error("画布不存在或无权访问");

  const feedback = await challengeOutreachDimension({
    dim,
    use_case: canvas.use_case as string,
    scenario: canvas.scenario as string,
    user_notes: userNotes,
  });

  const newChallenge: AiChallenge = {
    dim,
    user_snapshot: userNotes,
    feedback,
    created_at: new Date().toISOString(),
  };

  const existing = Array.isArray(canvas.ai_challenges) ? canvas.ai_challenges : [];
  const updated = [
    ...existing.filter((c: AiChallenge) => c.dim !== dim),
    newChallenge,
  ];

  await supabaseAdmin
    .from("outreach_canvases")
    .update({ ai_challenges: updated, updated_at: new Date().toISOString() })
    .eq("id", canvasId)
    .eq("user_id", userId);

  return feedback;
}

export async function polishDraft(canvasId: string): Promise<string> {
  const userId = await requireUserId();

  const { data: canvas } = await supabaseAdmin
    .from("outreach_canvases")
    .select("scenario, person_notes, place_notes, time_notes, message_draft")
    .eq("id", canvasId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!canvas) throw new Error("画布不存在或无权访问");

  const draft = await polishOutreachDraft({
    scenario: canvas.scenario as string,
    person_notes: canvas.person_notes as string,
    place_notes: canvas.place_notes as string,
    time_notes: canvas.time_notes as string,
    user_draft: (canvas.message_draft as string) || undefined,
  });

  await supabaseAdmin
    .from("outreach_canvases")
    .update({ message_draft: draft, updated_at: new Date().toISOString() })
    .eq("id", canvasId)
    .eq("user_id", userId);

  return draft;
}
