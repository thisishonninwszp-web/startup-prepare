"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { tavilyExtract, tavilySearch } from "@/lib/external";
import {
  answerAsCustomerProxy,
  buildCustomerProxy,
  compareCustomerProxyVersions,
  extractCustomerEvidence,
  generateCustomerOpportunities,
  generateCustomerPatternReport,
  reactToIdeaAsCustomer,
  segmentCustomerVoices,
  translateQuery,
  type CustomerProxyTurn,
} from "@/lib/ai";
import { redactCustomerPii } from "./privacy";
import {
  CUSTOMER_CADENCES,
  CUSTOMER_MARKETS,
  CUSTOMER_MATERIAL_ORIGINS,
  CUSTOMER_REVIEW_STATUSES,
  filterEvidenceForSegment,
  isProvisionalProxy,
  nextCustomerRun,
  parseCustomerPatternReport,
  parseCustomerProxy,
  parseCustomerSegments,
  type CustomerCadence,
  type CustomerEvidenceAtom,
  type EmotionBasis,
  type CustomerMarket,
  type CustomerMaterialOrigin,
  type CustomerReviewStatus,
  type CustomerSegment,
} from "./types";

const CUSTOMER_PROMPT_VERSION = "customer-v1";

type CreateCustomerCaseInput = {
  title: string;
  customerHypothesis: string;
  problemContext: string;
  markets: CustomerMarket[];
  originalBelief: string;
  ideaId?: string | null;
};

export type CustomerSearchResult = {
  inserted: number;
  errors: { market: CustomerMarket; message: string }[];
  queued?: boolean;
};

async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  return user.id;
}

function assertOwner(
  ownerId: string | null | undefined,
  userId: string,
  message: string
) {
  if (!ownerId || ownerId !== userId) throw new Error(message);
}

function cleanText(value: string, label: string, max = 10_000): string {
  const text = value.trim();
  if (!text) throw new Error(`${label}不能为空`);
  if (text.length > max) throw new Error(`${label}不能超过${max}字`);
  return text;
}

async function requireCustomerCase(caseId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("customer_cases")
    .select(
      "id, user_id, idea_id, title, customer_hypothesis, problem_context, markets, original_belief, archived_at"
    )
    .eq("id", caseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  assertOwner(data?.user_id, userId, "无权访问该顾客课题");
  if (!data) throw new Error("无权访问该顾客课题");
  if (data.archived_at) throw new Error("该顾客课题已归档");
  return data;
}

async function assertIdeaOwner(ideaId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("ideas")
    .select("id, user_id, title, hypothesis, status")
    .eq("id", ideaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  assertOwner(data?.user_id, userId, "无权访问该想法");
  if (!data) throw new Error("无权访问该想法");
  return data;
}

function dedupeKey(source: string, sourceId: string | null, text: string) {
  return createHash("sha256")
    .update(`${source}\0${sourceId ?? ""}\0${text.trim()}`)
    .digest("hex");
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "web";
  }
}

async function upsertMaterial(
  userId: string,
  row: {
    origin: CustomerMaterialOrigin;
    source: string;
    sourceId?: string | null;
    sourceUrl?: string | null;
    title?: string | null;
    text: string;
    language?: string | null;
    market?: CustomerMarket | null;
  }
) {
  const sanitized = redactCustomerPii(row.text).text.slice(0, 20_000);
  const key = dedupeKey(row.source, row.sourceId ?? row.sourceUrl ?? null, sanitized);
  const { data, error } = await supabaseAdmin
    .from("customer_materials")
    .upsert(
      {
        user_id: userId,
        origin: row.origin,
        source: row.source,
        source_id: row.sourceId ?? null,
        source_url: row.sourceUrl ?? null,
        title: row.title?.trim() || null,
        sanitized_text: sanitized,
        dedupe_key: key,
        language: row.language ?? null,
        market: row.market ?? null,
      },
      { onConflict: "user_id,dedupe_key" }
    )
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function attachMaterial(
  caseId: string,
  materialId: string,
  status: CustomerReviewStatus
) {
  const { data, error } = await supabaseAdmin
    .from("customer_case_materials")
    .upsert(
      {
        case_id: caseId,
        material_id: materialId,
        status,
        reviewed_at: status === "candidate" ? null : new Date().toISOString(),
      },
      { onConflict: "case_id,material_id" }
    )
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function createCustomerCase(
  input: CreateCustomerCaseInput
): Promise<string> {
  const userId = await requireUserId();
  const markets = Array.from(
    new Set(input.markets.filter((market) => CUSTOMER_MARKETS.includes(market)))
  );
  if (markets.length === 0) throw new Error("至少选择一个市场");
  if (input.ideaId) await assertIdeaOwner(input.ideaId, userId);

  const { data, error } = await supabaseAdmin
    .from("customer_cases")
    .insert({
      user_id: userId,
      idea_id: input.ideaId || null,
      title: cleanText(input.title, "标题", 120),
      customer_hypothesis: cleanText(input.customerHypothesis, "暂定顾客"),
      problem_context: cleanText(input.problemContext, "问题场景"),
      markets,
      original_belief: cleanText(input.originalBelief, "原先理解"),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/customer-view");
  return data.id as string;
}

export async function searchCustomerMaterials(
  caseId: string
): Promise<CustomerSearchResult> {
  const userId = await requireUserId();
  const customerCase = await requireCustomerCase(caseId, userId);
  const translations = await translateQuery(
    `${customerCase.customer_hypothesis} ${customerCase.problem_context}`
  );
  const queryByMarket: Record<CustomerMarket, string> = {
    cn: translations.zh,
    jp: translations.ja,
    en: translations.en,
  };
  const languageByMarket: Record<CustomerMarket, string> = {
    cn: "zh",
    jp: "ja",
    en: "en",
  };
  const settled = await Promise.allSettled(
    (customerCase.markets as CustomerMarket[]).map(async (market) => {
      const results = await tavilySearch(queryByMarket[market], 8);
      let inserted = 0;
      for (const result of results) {
        if (!result.url || !result.content.trim()) continue;
        const materialId = await upsertMaterial(userId, {
          origin: "web",
          source: hostname(result.url),
          sourceId: result.url,
          sourceUrl: result.url,
          title: result.title,
          text: result.content,
          language: languageByMarket[market],
          market,
        });
        await attachMaterial(caseId, materialId, "candidate");
        inserted++;
      }
      return { market, inserted };
    })
  );

  let inserted = 0;
  const errors: CustomerSearchResult["errors"] = [];
  settled.forEach((result, index) => {
    const market = (customerCase.markets as CustomerMarket[])[index];
    if (result.status === "fulfilled") inserted += result.value.inserted;
    else {
      console.error("顾客市场搜索失败", { market, error: result.reason });
      errors.push({
        market,
        message:
          result.reason instanceof Error ? result.reason.message : "搜索失败",
      });
    }
  });
  revalidatePath(`/customer-view/${caseId}`);
  revalidatePath("/customer-view/inbox");
  return { inserted, errors };
}

export async function previewCustomerUrl(url: string) {
  await requireUserId();
  const normalized = new URL(url.trim());
  if (normalized.protocol !== "http:" && normalized.protocol !== "https:") {
    throw new Error("只支持公开的HTTP/HTTPS地址");
  }
  const extracted = await tavilyExtract(normalized.toString());
  const redacted = redactCustomerPii(extracted.content.slice(0, 20_000));
  return {
    title: extracted.title,
    url: extracted.url,
    text: redacted.text,
    redactions: redacted.redactions,
  };
}

export async function addCustomerMaterial(
  caseId: string,
  input: {
    origin: CustomerMaterialOrigin;
    title: string;
    text: string;
    sourceUrl?: string;
    market?: CustomerMarket;
    confirmed: boolean;
  }
): Promise<string> {
  if (!input.confirmed) throw new Error("请先确认遮蔽后的材料");
  if (!CUSTOMER_MATERIAL_ORIGINS.includes(input.origin)) {
    throw new Error("材料类型无效");
  }
  const userId = await requireUserId();
  await requireCustomerCase(caseId, userId);
  const sanitized = redactCustomerPii(cleanText(input.text, "材料", 20_000));
  const materialId = await upsertMaterial(userId, {
    origin: input.origin,
    source: input.sourceUrl ? hostname(input.sourceUrl) : "user",
    sourceId: input.sourceUrl || null,
    sourceUrl: input.sourceUrl || null,
    title: cleanText(input.title, "材料标题", 160),
    text: sanitized.text,
    market: input.market ?? null,
  });
  await attachMaterial(caseId, materialId, "kept");
  revalidatePath(`/customer-view/${caseId}`);
  revalidatePath("/customer-view/library");
  return materialId;
}

async function loadMaterialForCase(
  caseId: string,
  materialId: string,
  userId: string
) {
  await requireCustomerCase(caseId, userId);
  const { data, error } = await supabaseAdmin
    .from("customer_case_materials")
    .select(
      "id, status, customer_materials!inner(id, user_id, title, source, sanitized_text)"
    )
    .eq("case_id", caseId)
    .eq("material_id", materialId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const material = Array.isArray(data?.customer_materials)
    ? data?.customer_materials[0]
    : data?.customer_materials;
  assertOwner(material?.user_id, userId, "无权访问该顾客材料");
  if (!data || !material) throw new Error("无权访问该顾客材料");
  return { link: data, material };
}

async function extractAndSaveMaterialEvidence(
  material: {
    id: string;
    title: string | null;
    source: string;
    sanitized_text: string;
  },
  userId: string
) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("customer_evidence_atoms")
    .select("id")
    .eq("material_id", material.id)
    .limit(1);
  if (existingError) throw new Error(existingError.message);
  if ((existing ?? []).length > 0) return;

  const atoms = await extractCustomerEvidence([
    {
      id: material.id,
      title: material.title ?? "无标题材料",
      source: material.source,
      text: material.sanitized_text,
    },
  ]);
  if (atoms.length === 0) return;
  const { error } = await supabaseAdmin.from("customer_evidence_atoms").insert(
    atoms.map((atom) => ({
      user_id: userId,
      material_id: material.id,
      quote: atom.quote.slice(0, 600),
      scene: atom.scene,
      behavior: atom.behavior,
      alternative: atom.alternative,
      tradeoff: atom.tradeoff,
      emotion: atom.emotion,
      emotion_basis: atom.emotion_basis,
      prompt_version: CUSTOMER_PROMPT_VERSION,
    }))
  );
  if (error) throw new Error(error.message);
}

export async function reviewCustomerMaterial(
  caseId: string,
  materialId: string,
  status: CustomerReviewStatus
): Promise<void> {
  if (!CUSTOMER_REVIEW_STATUSES.includes(status)) throw new Error("审核状态无效");
  const userId = await requireUserId();
  const { link, material } = await loadMaterialForCase(
    caseId,
    materialId,
    userId
  );
  if (status === "kept") {
    await extractAndSaveMaterialEvidence(material, userId);
  }
  const { error } = await supabaseAdmin
    .from("customer_case_materials")
    .update({
      status,
      reviewed_at: status === "candidate" ? null : new Date().toISOString(),
    })
    .eq("id", link.id);
  if (error) throw new Error(error.message);
  revalidatePath(`/customer-view/${caseId}`);
  revalidatePath("/customer-view/inbox");
  revalidatePath("/customer-view/library");
}

async function loadKeptEvidence(caseId: string, userId: string) {
  await requireCustomerCase(caseId, userId);
  const { data: links, error } = await supabaseAdmin
    .from("customer_case_materials")
    .select("material_id")
    .eq("case_id", caseId)
    .eq("status", "kept");
  if (error) throw new Error(error.message);
  const materialIds = (links ?? []).map((link) => link.material_id as string);
  if (materialIds.length === 0) {
    return { materialIds: [], atoms: [] as CustomerEvidenceAtom[] };
  }
  const { data: atoms, error: atomError } = await supabaseAdmin
    .from("customer_evidence_atoms")
    .select(
      "id, material_id, quote, scene, behavior, alternative, tradeoff, emotion, emotion_basis"
    )
    .eq("user_id", userId)
    .in("material_id", materialIds);
  if (atomError) throw new Error(atomError.message);
  return {
    materialIds,
    atoms: (atoms ?? []) as CustomerEvidenceAtom[],
  };
}

export async function runCustomerResearch(caseId: string): Promise<string> {
  const userId = await requireUserId();
  await requireCustomerCase(caseId, userId);
  const { atoms } = await loadKeptEvidence(caseId, userId);
  if (atoms.length < 2) throw new Error("至少需要2条已提取证据才能区分顾客声音");
  const result = await segmentCustomerVoices(atoms);
  const { data, error } = await supabaseAdmin
    .from("customer_research_runs")
    .insert({
      case_id: caseId,
      evidence_ids: atoms.map((atom) => atom.id),
      segments: result,
      prompt_version: CUSTOMER_PROMPT_VERSION,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath(`/customer-view/${caseId}`);
  return data.id as string;
}

async function loadResearchRun(runId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("customer_research_runs")
    .select("id, case_id, evidence_ids, segments, customer_cases!inner(user_id)")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const relation = Array.isArray(data?.customer_cases)
    ? data?.customer_cases[0]
    : data?.customer_cases;
  assertOwner(relation?.user_id, userId, "无权访问该研究批次");
  if (!data) throw new Error("无权访问该研究批次");
  return data;
}

async function loadEvidenceByIds(ids: string[], userId: string) {
  if (ids.length === 0) return [] as CustomerEvidenceAtom[];
  const { data, error } = await supabaseAdmin
    .from("customer_evidence_atoms")
    .select(
      "id, material_id, quote, scene, behavior, alternative, tradeoff, emotion, emotion_basis"
    )
    .eq("user_id", userId)
    .in("id", ids);
  if (error) throw new Error(error.message);
  if ((data ?? []).length !== new Set(ids).size) throw new Error("证据集合不完整");
  return (data ?? []) as CustomerEvidenceAtom[];
}

export async function createCustomerProxyVersion(
  runId: string,
  segmentKey: string
): Promise<string> {
  const userId = await requireUserId();
  const run = await loadResearchRun(runId, userId);
  const segments = parseCustomerSegments(run.segments).segments;
  const segment = segments.find((item) => item.key === segmentKey);
  if (!segment) throw new Error("顾客类型不存在");
  const atoms = await loadEvidenceByIds(run.evidence_ids as string[], userId);
  const segmentAtoms = filterEvidenceForSegment(atoms, segment);
  if (segmentAtoms.length === 0) throw new Error("该顾客声音没有可用证据");
  const materialIds = Array.from(
    new Set(segmentAtoms.map((atom) => atom.material_id))
  );
  const provisional = isProvisionalProxy(materialIds);
  const proxy = await buildCustomerProxy(segment, segmentAtoms, provisional);

  const { data: previous, error: previousError } = await supabaseAdmin
    .from("customer_proxy_versions")
    .select("id, version_no, proxy")
    .eq("case_id", run.case_id)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previousError) throw new Error(previousError.message);
  const delta = previous
    ? await compareCustomerProxyVersions(
        parseCustomerProxy(previous.proxy),
        proxy
      )
    : null;
  const { data, error } = await supabaseAdmin
    .from("customer_proxy_versions")
    .insert({
      case_id: run.case_id,
      research_run_id: run.id,
      previous_version_id: previous?.id ?? null,
      version_no: (previous?.version_no ?? 0) + 1,
      selected_segment: segment,
      proxy,
      delta,
      is_provisional: provisional,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await supabaseAdmin
    .from("customer_cases")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", run.case_id);
  revalidatePath(`/customer-view/${run.case_id}`);
  return data.id as string;
}

async function loadProxyContext(versionId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("customer_proxy_versions")
    .select(
      "id, case_id, research_run_id, selected_segment, proxy, customer_cases!inner(user_id, idea_id)"
    )
    .eq("id", versionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const customerCase = Array.isArray(data?.customer_cases)
    ? data?.customer_cases[0]
    : data?.customer_cases;
  assertOwner(customerCase?.user_id, userId, "无权访问该顾客代理");
  if (!data || !customerCase) throw new Error("无权访问该顾客代理");
  const run = await loadResearchRun(data.research_run_id as string, userId);
  const runAtoms = await loadEvidenceByIds(
    run.evidence_ids as string[],
    userId
  );
  const atoms = filterEvidenceForSegment(
    runAtoms,
    data.selected_segment as CustomerSegment
  );
  if (atoms.length === 0) throw new Error("顾客代理的证据边界为空");
  return {
    version: data,
    customerCase,
    proxy: parseCustomerProxy(data.proxy),
    atoms,
  };
}

export async function sendCustomerProxyMessage(
  versionId: string,
  question: string
) {
  const userId = await requireUserId();
  const text = cleanText(question, "问题", 3000);
  const context = await loadProxyContext(versionId, userId);
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("customer_proxy_sessions")
    .select("id, messages")
    .eq("proxy_version_id", versionId)
    .eq("mode", "listen")
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  const messages = Array.isArray(existing?.messages)
    ? [...existing.messages]
    : [];
  const turns: CustomerProxyTurn[] = messages.map((message) => ({
    role: message.role === "assistant" ? "assistant" : "user",
    content: String(message.content ?? ""),
  }));
  const answer = await answerAsCustomerProxy(
    context.proxy,
    context.atoms,
    turns,
    text
  );
  messages.push({ role: "user", content: text });
  messages.push({ role: "assistant", ...answer, content: answer.answer });
  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from("customer_proxy_sessions")
      .update({ messages, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabaseAdmin.from("customer_proxy_sessions").insert({
      proxy_version_id: versionId,
      mode: "listen",
      messages,
    });
    if (error) throw new Error(error.message);
  }
  revalidatePath(`/customer-view/${context.version.case_id}`);
  return messages;
}

export async function runCustomerIdeaReaction(
  versionId: string,
  ideaId?: string | null
) {
  const userId = await requireUserId();
  const context = await loadProxyContext(versionId, userId);
  const targetIdeaId = ideaId || (context.customerCase.idea_id as string | null);
  if (!targetIdeaId) throw new Error("请先关联一个想法");
  const idea = await assertIdeaOwner(targetIdeaId, userId);
  const ideaSnapshot = {
    id: idea.id,
    title: idea.title,
    status: idea.status,
    hypothesis: idea.hypothesis,
  };
  const reaction = await reactToIdeaAsCustomer(
    context.proxy,
    context.atoms,
    ideaSnapshot
  );
  const messages = [
    { role: "user", content: JSON.stringify(ideaSnapshot) },
    {
      role: "assistant",
      content: reaction.first_reaction,
      ...reaction,
    },
  ];
  const { error } = await supabaseAdmin.from("customer_proxy_sessions").insert({
    proxy_version_id: versionId,
    mode: "idea_reaction",
    idea_id: targetIdeaId,
    idea_snapshot: ideaSnapshot,
    messages,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/customer-view/${context.version.case_id}`);
  return reaction;
}

export async function saveCustomerConclusion(
  versionId: string,
  input: {
    originalMisunderstanding: string;
    updatedUnderstanding: string;
    stillUnknown: string;
    contactPerson: string;
    oneQuestion: string;
  }
): Promise<void> {
  const userId = await requireUserId();
  const context = await loadProxyContext(versionId, userId);
  const { error } = await supabaseAdmin.from("customer_conclusions").upsert(
    {
      proxy_version_id: versionId,
      original_misunderstanding: cleanText(
        input.originalMisunderstanding,
        "原先误解"
      ),
      updated_understanding: cleanText(
        input.updatedUnderstanding,
        "更新理解"
      ),
      still_unknown: cleanText(input.stillUnknown, "仍然未知"),
      contact_person: cleanText(input.contactPerson, "接触对象", 500),
      one_question: cleanText(input.oneQuestion, "唯一问题", 1000),
    },
    { onConflict: "proxy_version_id" }
  );
  if (error) throw new Error(error.message);
  revalidatePath(`/customer-view/${context.version.case_id}`);
}

export async function createCustomerTopic(
  caseId: string,
  input: {
    query: string;
    markets: CustomerMarket[];
    cadence: CustomerCadence;
  }
): Promise<string> {
  const userId = await requireUserId();
  await requireCustomerCase(caseId, userId);
  if (!CUSTOMER_CADENCES.includes(input.cadence)) throw new Error("抓取节奏无效");
  const markets = Array.from(
    new Set(input.markets.filter((market) => CUSTOMER_MARKETS.includes(market)))
  );
  if (markets.length === 0) throw new Error("至少选择一个市场");
  const queryText = cleanText(input.query, "研究主题", 500);
  const translated = await translateQuery(queryText);
  const { data, error } = await supabaseAdmin
    .from("customer_research_topics")
    .insert({
      user_id: userId,
      case_id: caseId,
      query: queryText,
      translated_queries: translated,
      markets,
      cadence: input.cadence,
      next_run_at: nextCustomerRun(input.cadence).toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/customer-view/topics");
  return data.id as string;
}

export async function setCustomerTopicEnabled(
  topicId: string,
  enabled: boolean
): Promise<void> {
  const userId = await requireUserId();
  const { data, error } = await supabaseAdmin
    .from("customer_research_topics")
    .select("id, user_id")
    .eq("id", topicId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  assertOwner(data?.user_id, userId, "无权修改该研究主题");
  const { error: updateError } = await supabaseAdmin
    .from("customer_research_topics")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("id", topicId);
  if (updateError) throw new Error(updateError.message);
  revalidatePath("/customer-view/topics");
}

export async function runCustomerTopicNow(topicId: string) {
  const userId = await requireUserId();
  const { data, error } = await supabaseAdmin
    .from("customer_research_topics")
    .select("id, user_id, case_id, cadence")
    .eq("id", topicId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  assertOwner(data?.user_id, userId, "无权运行该研究主题");
  if (!data) throw new Error("无权运行该研究主题");
  const workerUrl = process.env.CRAWLER_WORKER_URL;
  const workerSecret = process.env.CRAWLER_SECRET;
  if (workerUrl && workerSecret) {
    const response = await fetch(`${workerUrl.replace(/\/$/, "")}/crawl`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${workerSecret}`,
      },
      body: JSON.stringify({ customerTopicId: topicId }),
    });
    if (!response.ok) throw new Error(`顾客研究worker触发失败（${response.status}）`);
    return { inserted: 0, errors: [], queued: true };
  }
  try {
    const result = await searchCustomerMaterials(data.case_id as string);
    await supabaseAdmin
      .from("customer_research_topics")
      .update({
        last_run_at: new Date().toISOString(),
        next_run_at: nextCustomerRun(data.cadence as CustomerCadence).toISOString(),
        last_error: result.errors.length
          ? result.errors.map((item) => `${item.market}: ${item.message}`).join("; ")
          : null,
      })
      .eq("id", topicId);
    return result;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "运行失败";
    await supabaseAdmin
      .from("customer_research_topics")
      .update({ last_run_at: new Date().toISOString(), last_error: message })
      .eq("id", topicId);
    throw caught;
  }
}

export async function createCustomerPatternReport(
  filters: {
    markets?: CustomerMarket[];
    languages?: string[];
    sources?: string[];
    alternatives?: string;
    emotionBases?: EmotionBasis[];
    caseIds?: string[];
    query?: string;
  }
): Promise<string> {
  const userId = await requireUserId();
  const { data: ownedCases, error: caseError } = await supabaseAdmin
    .from("customer_cases")
    .select("id")
    .eq("user_id", userId);
  if (caseError) throw new Error(caseError.message);
  const caseIds = (ownedCases ?? []).map((item) => item.id as string);
  if (caseIds.length === 0) throw new Error("还没有顾客研究课题");
  const scopedCaseIds = filters.caseIds?.length
    ? filters.caseIds.filter((id) => caseIds.includes(id))
    : caseIds;
  if (scopedCaseIds.length === 0) throw new Error("顾客类型筛选无效");
  const { data: keptLinks, error: linkError } = await supabaseAdmin
    .from("customer_case_materials")
    .select("material_id")
    .in("case_id", scopedCaseIds)
    .eq("status", "kept");
  if (linkError) throw new Error(linkError.message);
  const keptMaterialIds = Array.from(
    new Set((keptLinks ?? []).map((item) => item.material_id as string))
  );
  if (keptMaterialIds.length === 0) throw new Error("还没有保留的顾客材料");
  const query = supabaseAdmin
    .from("customer_evidence_atoms")
    .select(
      "id, material_id, quote, scene, behavior, alternative, tradeoff, emotion, emotion_basis, customer_materials!inner(user_id, market, language, source, sanitized_text)"
    )
    .eq("user_id", userId)
    .in("material_id", keptMaterialIds);
  const { data, error } = await query.limit(200);
  if (error) throw new Error(error.message);
  const atoms = (data ?? []).filter((row) => {
    const material = Array.isArray(row.customer_materials)
      ? row.customer_materials[0]
      : row.customer_materials;
    if (
      filters.markets?.length &&
      !filters.markets.includes(material?.market as CustomerMarket)
    ) {
      return false;
    }
    if (
      filters.languages?.length &&
      !filters.languages.includes(String(material?.language ?? ""))
    ) {
      return false;
    }
    if (
      filters.sources?.length &&
      !filters.sources.includes(String(material?.source ?? ""))
    ) {
      return false;
    }
    if (
      filters.emotionBases?.length &&
      !filters.emotionBases.includes(row.emotion_basis as EmotionBasis)
    ) {
      return false;
    }
    if (
      filters.alternatives?.trim() &&
      !String(row.alternative ?? "")
        .toLowerCase()
        .includes(filters.alternatives.trim().toLowerCase())
    ) {
      return false;
    }
    if (filters.query?.trim()) {
      const haystack = `${row.quote} ${row.scene} ${row.behavior} ${row.alternative}`.toLowerCase();
      if (!haystack.includes(filters.query.trim().toLowerCase())) return false;
    }
    return true;
  }) as CustomerEvidenceAtom[];
  if (atoms.length < 2) throw new Error("至少需要2条证据才能生成模式报告");
  const report = await generateCustomerPatternReport(atoms, filters);
  const { data: saved, error: saveError } = await supabaseAdmin
    .from("customer_pattern_reports")
    .insert({
      user_id: userId,
      filters,
      report,
      evidence_ids: atoms.map((atom) => atom.id),
      prompt_version: CUSTOMER_PROMPT_VERSION,
    })
    .select("id")
    .single();
  if (saveError) throw new Error(saveError.message);
  revalidatePath("/customer-view/patterns");
  return saved.id as string;
}

export async function createOpportunitiesFromReport(
  reportId: string
): Promise<void> {
  const userId = await requireUserId();
  const { data, error } = await supabaseAdmin
    .from("customer_pattern_reports")
    .select("id, user_id, report, evidence_ids")
    .eq("id", reportId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  assertOwner(data?.user_id, userId, "无权访问该模式报告");
  if (!data) throw new Error("无权访问该模式报告");
  const { count, error: countError } = await supabaseAdmin
    .from("customer_opportunities")
    .select("id", { count: "exact", head: true })
    .eq("report_id", reportId);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) > 0) return;
  const report = parseCustomerPatternReport(data.report);
  const opportunities = await generateCustomerOpportunities(
    report,
    data.evidence_ids as string[]
  );
  if (opportunities.opportunities.length > 0) {
    const { error: insertError } = await supabaseAdmin
      .from("customer_opportunities")
      .insert(
        opportunities.opportunities.map((draft, index) => ({
          report_id: reportId,
          ordinal: index + 1,
          draft,
        }))
      );
    if (insertError) throw new Error(insertError.message);
  }
  revalidatePath("/customer-view/patterns");
}

export async function promoteCustomerOpportunity(
  opportunityId: string
): Promise<string> {
  const userId = await requireUserId();
  const { data, error } = await supabaseAdmin
    .from("customer_opportunities")
    .select(
      "id, draft, created_idea_id, customer_pattern_reports!inner(user_id)"
    )
    .eq("id", opportunityId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const report = Array.isArray(data?.customer_pattern_reports)
    ? data?.customer_pattern_reports[0]
    : data?.customer_pattern_reports;
  assertOwner(report?.user_id, userId, "无权使用该候选机会");
  if (!data) throw new Error("无权使用该候选机会");
  if (data.created_idea_id) return data.created_idea_id as string;
  const { data: ideaId, error: rpcError } = await supabaseAdmin.rpc(
    "promote_customer_opportunity",
    {
      p_opportunity_id: opportunityId,
      p_user_id: userId,
    }
  );
  if (rpcError) throw new Error(rpcError.message);
  if (!ideaId) throw new Error("候选机会未能创建想法");
  revalidatePath("/ideas");
  revalidatePath("/customer-view/patterns");
  return ideaId as string;
}
