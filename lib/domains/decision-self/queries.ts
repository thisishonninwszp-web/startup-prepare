import { supabaseAdmin } from "@/lib/supabase";
import { isAiLocked, type IdeaStatus } from "@/app/(app)/ideas/types";
import { SKILL_DEFS } from "@/lib/domains/self-model/skills";
import { SOURCE_TYPES, parseSource, parseTarget, type SelfTarget, type SelfSource, type SelfRecord, type SelfLink, type SourceType, type SelfContextState } from "./domain";

const TARGET_TABLES = { idea: "ideas", dream_case: "dream_cases", reality_case: "reality_cases" } as const;
const TARGET_COLUMNS = {
  idea: "id,user_id,title,hypothesis,status,last_activity_at",
  dream_case: "id,user_id,title,context,initial_desire",
  reality_case: "id,user_id,title,messages,initial_statement",
} as const;

export async function requireSelfTarget(userId: string, input: SelfTarget, forAi = false): Promise<{ title: string; context: string }> {
  const target = parseTarget(input.type, input.id);
  const { data, error } = await supabaseAdmin.from(TARGET_TABLES[target.type])
    .select(TARGET_COLUMNS[target.type]).eq("id", target.id).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("这条决策不存在，或你无权查看");
  const row = data as unknown as Record<string, unknown>;
  if (forAi && target.type === "idea" && isAiLocked(row.status as IdeaStatus, row.last_activity_at as string)) {
    throw new Error("AI 质疑已暂停，请先记录一次真实接触。");
  }
  return { title: String(row.title ?? "未命名"), context: JSON.stringify({ title: row.title, hypothesis: row.hypothesis, context: row.context, initial_desire: row.initial_desire, initial_statement: row.initial_statement, messages: row.messages }).slice(0, 20000) };
}

export function isMissingCustomSkills(error: { code?: string; message: string }): boolean {
  return error.code === "PGRST205" && error.message.includes("self_custom_skills");
}

const DATE_COLUMNS: Record<SourceType, string> = {
  self_hypotheses: "created_at", self_deeds: "occurred_on", self_skill_nodes: "unlocked_on", self_resources: "recorded_on",
};
const text = (value: unknown) => value == null ? "未记录" : typeof value === "string" ? value : JSON.stringify(value);
function normalize(type: SourceType, row: Record<string, unknown>, skillName?: string): SelfRecord {
  const id = String(row.id);
  let title: string;
  let date: string;
  let body: string;
  if (type === "self_hypotheses") {
    title = text(row.statement);
    date = text(row.last_evidence_on ?? row.first_observed);
    const tiers: Record<string, string> = { hunch: "猜想", working: "工作假设", load_bearing: "可用于判断", refuted: "已推翻", archived: "已归档" };
    body = `当时的判断：${title}\n适用范围：${text(row.scope_note)}\n当时记为：${tiers[String(row.tier)] ?? "未记录"}（现在是否适用，还需对照实际经历）\n已推翻的原因：${text(row.refuted_reason)}\n推翻时间：${text(row.refuted_at)}\n其他可能解释：${text(row.alternative_explanations)}`;
  } else if (type === "self_deeds") {
    title = text(row.title); date = text(row.occurred_on);
    const outcomes: Record<string, string> = { done: "已做完", abandoned: "已结束尝试", ongoing: "进行中" };
    body = `发生了什么：${text(row.what_happened)}\n付出的代价：${text(row.cost)}\n结果：${outcomes[String(row.outcome)] ?? "未记录"}\n有人使用或接受：${row.adopted == null ? "未记录／不适用" : row.adopted ? "有" : "没有"}\n历时天数：${text(row.duration_days)}`;
  } else if (type === "self_skill_nodes") {
    title = skillName ?? SKILL_DEFS.find((skill) => skill.key === row.skill_key)?.name ?? "技能实践（原名称暂不可用）";
    date = text(row.unlocked_on);
    body = `技能实践依据：${text(row.proof)}\n这是用户记录的一次实践，不能据此断言在所有情境下都具备该能力。`;
  } else {
    title = "当时的时间与资源"; date = text(row.recorded_on);
    body = `资金可支撑月数：${text(row.runway_months)}\n每周可用小时：${text(row.weekly_free_hours)}\n可求助的人数：${text(row.allies)}\n备注：${text(row.note)}\n这是记录当天的情况，使用前需确认是否仍然适用。`;
  }
  return { type, id, title, date, text: body, href: `/self/records/${type}/${id}` };
}

export async function getSelfRecord(userId: string, input: SelfSource): Promise<SelfRecord | null> {
  const source = parseSource(input.type, input.id);
  const { data, error } = await supabaseAdmin.from(source.type).select("*")
    .eq("user_id", userId).eq("id", source.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  let skillName: string | undefined;
  if (source.type === "self_skill_nodes") {
    const { data: skill, error: skillError } = await supabaseAdmin.from("self_custom_skills")
      .select("name").eq("user_id", userId).eq("key", data.skill_key).maybeSingle();
    if (skillError && !isMissingCustomSkills(skillError)) throw new Error(skillError.message);
    skillName = skill?.name;
  }
  const record = normalize(source.type, data, skillName);
  if (source.type === "self_hypotheses") {
    const { data: windows, error: windowError } = await supabaseAdmin.from("self_windows")
      .select("occurred_on,situation,context_key,outcome,cost_paid,third_party")
      .eq("user_id", userId).eq("hypothesis_id", source.id).order("occurred_on", { ascending: false }).limit(30);
    if (windowError) throw new Error(windowError.message);
    record.text += `\n最近至多 30 次相关经历（含不符合假设的情况；不是全部历史统计）：\n${(windows ?? []).map((w) => `${w.occurred_on} · ${w.outcome === "hit" ? "符合假设" : "未符合假设"} · ${w.context_key}\n${w.situation}\n代价：${text(w.cost_paid)}；第三方反馈：${text(w.third_party)}`).join("\n\n") || "还没有记录，只能作为待验证的问题。"}`;
  }
  return record;
}

export async function getLinkedSelfRecords(userId: string, input: SelfTarget): Promise<SelfLink[]> {
  const target = parseTarget(input.type, input.id);
  await requireSelfTarget(userId, target);
  const { data, error } = await supabaseAdmin.from("decision_object_links")
    .select("to_object_type,to_object_id").eq("user_id", userId)
    .eq("from_object_type", target.type).eq("from_object_id", target.id).eq("link_type", "self_context")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return Promise.all((data ?? []).map(async (link) => {
    const source = parseSource(link.to_object_type, link.to_object_id);
    return { ...source, record: await getSelfRecord(userId, source) };
  }));
}

export async function getSelfContextState(userId: string, target: SelfTarget): Promise<SelfContextState> {
  await requireSelfTarget(userId, target);
  const links = await getLinkedSelfRecords(userId, target);
  const { data: custom, error: customError } = await supabaseAdmin.from("self_custom_skills")
    .select("key,name").eq("user_id", userId);
  if (customError && !isMissingCustomSkills(customError)) throw new Error(customError.message);
  const names = new Map((custom ?? []).map((skill) => [skill.key, skill.name]));
  const groups = await Promise.all(SOURCE_TYPES.map(async (type) => {
    const { data, error } = await supabaseAdmin.from(type).select("*").eq("user_id", userId)
      .order(DATE_COLUMNS[type], { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => normalize(type, row, names.get(row.skill_key)));
  }));
  return { records: groups.flat(), links };
}

export async function setSelfLink(userId: string, input: SelfTarget, sourceInput: SelfSource, selected: boolean): Promise<void> {
  const target = parseTarget(input.type, input.id);
  const source = parseSource(sourceInput.type, sourceInput.id);
  if (typeof selected !== "boolean") throw new Error("请选择是否关联这条记录");
  await requireSelfTarget(userId, target);
  const relation = { user_id: userId, from_object_type: target.type, from_object_id: target.id,
    to_object_type: source.type, to_object_id: source.id, link_type: "self_context" };
  if (selected) {
    if (!await getSelfRecord(userId, source)) throw new Error("这条自我记录不存在，或你无权查看");
    const { error } = await supabaseAdmin.from("decision_object_links").upsert(relation, {
      onConflict: "user_id,from_object_type,from_object_id,to_object_type,to_object_id,link_type",
    });
    if (error) throw new Error(error.message);
  } else {
    let query = supabaseAdmin.from("decision_object_links").delete();
    for (const [key, value] of Object.entries(relation)) query = query.eq(key, value);
    const { error } = await query;
    if (error) throw new Error(error.message);
  }
}
