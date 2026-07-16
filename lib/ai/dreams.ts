import { parseDreamBranchComparison, parseDreamBranchSuggestions, parseDreamDelta, parseDreamInterviewResult, parseDreamTurn, parseDreamVision, type DreamBranchComparison, type DreamBranchMessage, type DreamBranchSuggestions, type DreamCanvas, type DreamContext, type DreamDelta, type DreamInterviewPhase, type DreamInterviewResult, type DreamMessage, type DreamScale, type DreamTurn, type DreamVision, validateDreamInferenceReferences, validateDreamPhaseTransition, validateExplicitDreamPatches } from "@/app/(app)/dreams/types";
import { generateRealityJson } from "./reality";

// ---------------------------------------------------------------------------
// 梦想系统：先形成未来场景，再折叠展示现实前提与代价
// ---------------------------------------------------------------------------

export type DreamAiSource = {
  id: string;
  label: string;
  snapshot: unknown;
};

export type DreamAiContext = {
  context: DreamContext;
  scale: DreamScale;
  title: string;
  initialDesire: string;
  messages: DreamMessage[];
  sources: DreamAiSource[];
};

const DREAM_COMMON_RULES = `你服务于 IdeaOS 的梦想系统。目标是帮助用户形成可感知的未来画面，不是评估梦想好坏或把梦想压缩成任务。
铁律：
- 不生成任务清单、时间表、OKR、成功率、购买预测或行动建议。
- 不评分、不输出百分比，不说“很有潜力”“一定能实现”等迎合语言。
- 未来场景只能来自用户表达；不虚构财富、地位、人物、地点或社会影响。
- 现实来源只用于 assumptions、costs、reality_signals、conflicts，不能改写或否定 scene。
- 明确区分愿望、成立前提和已经存在的现实信号。
- 不做心理诊断。`;

const DREAM_INTERVIEW_PROMPT = `${DREAM_COMMON_RULES}
每轮只问1到3个问题，优先帮助用户看见：某个具体的一天、地点、人物、五感、正在做什么、内在状态、过去为何在意、不愿牺牲什么。
小梦聚焦1年内的日常体验；大梦聚焦3–5年的生活或事业结构；宏大梦聚焦10年以上以及对他人、行业或社会的影响。
信息足够形成场景时ready_to_synthesize=true。
只输出JSON：{"questions":[""],"missing_dimensions":[""],"ready_to_synthesize":false}`;

const DREAM_VISION_PROMPT = `${DREAM_COMMON_RULES}
先写一个具体但不虚构的“未来一天”场景。scene只使用用户访谈；现实来源只能进入折叠区字段。
只输出JSON：
{"scene":{"title":"","horizon":"","location":"","people":[""],"sensory_details":[""],"actions":[""],"inner_state":""},"desired_changes":[""],"past_roots":[""],"non_negotiables":[""],"costs":[""],"assumptions":[""],"reality_signals":[""],"conflicts":[""]}`;

const DREAM_DELTA_PROMPT = `${DREAM_COMMON_RULES}
比较同一梦想的两个版本。只描述变化，不判断哪个版本更好、更成熟或更现实。
只输出JSON：{"scene_changes":[""],"desired_change_updates":[""],"assumption_changes":[""],"new_costs":[""],"resolved_conflicts":[""],"new_conflicts":[""],"change_reason":""}`;

function renderDreamContext(input: DreamAiContext): string {
  const sourceText =
    input.sources.length > 0
      ? input.sources
          .map(
            (source) =>
              `[现实来源 ${source.id}] ${source.label}\n${JSON.stringify(
                source.snapshot
              )}`
          )
          .join("\n\n")
      : "（未选择现实来源）";
  const messages =
    input.messages.length > 0
      ? input.messages
          .map((message) =>
            message.role === "user"
              ? `用户：${message.content}`
              : `AI：${message.content}`
          )
          .join("\n")
      : "（尚无访谈）";
  return `语境：${input.context}
尺度：${input.scale}
标题：${input.title}
最初愿望：${input.initialDesire}

访谈：
${messages}

现实来源（不得用于改写scene）：
${sourceText}`;
}

export async function nextDreamQuestions(
  input: DreamAiContext
): Promise<DreamInterviewResult> {
  return generateRealityJson(
    DREAM_INTERVIEW_PROMPT,
    renderDreamContext(input),
    parseDreamInterviewResult
  );
}

export async function buildDreamVision(
  input: DreamAiContext
): Promise<DreamVision> {
  return generateRealityJson(
    DREAM_VISION_PROMPT,
    renderDreamContext(input),
    parseDreamVision
  );
}

export async function compareDreamVersions(
  previous: DreamVision,
  current: DreamVision,
  changeReason: string
): Promise<DreamDelta> {
  return generateRealityJson(
    DREAM_DELTA_PROMPT,
    `上一版本：${JSON.stringify(previous)}

当前版本：${JSON.stringify(current)}

用户说明的变化原因：${changeReason || "未补充"}`,
    parseDreamDelta
  );
}

const DREAM_TURN_PROMPT = `${DREAM_COMMON_RULES}
你正在进行单题访谈。阶段顺序是 memory_bridge、future_day、people、inner_state、meaning、non_negotiables、fork_point。
每次只能返回一道自然问题。先从用户真实经历中的轻松、投入或羡慕片段借桥，再逐步进入未来。
explicit_patches只能逐字引用用户消息中的连续原话，text必须与source_quote完全一致；不得改写。任何归纳、解释或推测必须放入inferences并保持pending。
inferences可引用用户消息ID，也可引用给定现实来源ID。引用现实来源时只能写入costs、assumptions、reality_signals、conflicts。
画布维度只能是：memory_fragments、scene_title、horizon、location、people、sensory_details、actions、inner_state、desired_changes、past_roots、non_negotiables、costs、assumptions、reality_signals、conflicts。
没有表达的维度放入unknown_dimensions，不要补全。
只输出JSON：{"question":"","phase":"memory_bridge","target_dimension":"memory_fragments","explicit_patches":[{"dimension":"memory_fragments","text":"","source_quote":"","source_message_id":""}],"inferences":[{"dimension":"inner_state","text":"","source_message_ids":[""],"source_ids":[]}],"unknown_dimensions":["people"],"ready_to_synthesize":false}`;

const DREAM_BRANCH_SUGGESTION_PROMPT = `${DREAM_COMMON_RULES}
只从用户已经表达的真实取舍中提出0到3条未来分支建议。每条必须引用支持它的用户消息ID。
不得给分、排序、推荐，不得发明用户没有表达的人物、身份、财富或社会影响。
只输出JSON：{"suggestions":[{"label":"","fork_question":"","tradeoff":"","source_message_ids":[""]}]}`;

const DREAM_BRANCH_COMPARE_PROMPT = `${DREAM_COMMON_RULES}
比较多个未来分支的已确认画布。只描述共同点、具体维度差异和仍未知内容。
禁止推荐胜者、排序、评分、百分比、成功概率或“更现实”等判断。
只输出JSON：{"common_ground":[""],"differences":[{"dimension":"actions","branches":[{"branch_id":"","summary":""}]}],"unknowns":[""]}`;

export async function nextDreamTurn(input: {
  branchId: string;
  context: DreamContext;
  scale: DreamScale;
  title: string;
  initialDesire: string;
  phase: string;
  messages: DreamBranchMessage[];
  canvas: DreamCanvas;
  sources: DreamAiSource[];
}): Promise<DreamTurn> {
  const result = await generateRealityJson(
    DREAM_TURN_PROMPT,
    `语境：${input.context}
尺度：${input.scale}
梦想：${input.title}
最初愿望：${input.initialDesire}
当前阶段：${input.phase}
已确认与待确认画布：${JSON.stringify(input.canvas)}
消息：${JSON.stringify(input.messages)}
现实来源（只能影响前提、代价、信号和冲突）：${JSON.stringify(input.sources)}`,
    parseDreamTurn
  );
  validateDreamPhaseTransition(
    input.phase as DreamInterviewPhase,
    result.phase
  );
  validateExplicitDreamPatches(
    result.explicit_patches,
    input.messages,
    input.branchId
  );
  const allowedIds = new Set(
    input.messages
      .filter((message) => message.branch_id === input.branchId)
      .map((message) => message.id)
  );
  validateDreamInferenceReferences(
    result.inferences,
    allowedIds,
    new Set(input.sources.map((source) => source.id))
  );
  return result;
}

export async function suggestDreamBranches(input: {
  branchId: string;
  messages: DreamBranchMessage[];
  canvas: DreamCanvas;
}): Promise<DreamBranchSuggestions> {
  const result = await generateRealityJson(
    DREAM_BRANCH_SUGGESTION_PROMPT,
    `当前分支：${input.branchId}
用户消息：${JSON.stringify(
      input.messages.filter((message) => message.role === "user")
    )}
画布：${JSON.stringify(input.canvas)}`,
    parseDreamBranchSuggestions
  );
  const allowedIds = new Set(
    input.messages
      .filter(
        (message) =>
          message.role === "user" && message.branch_id === input.branchId
      )
      .map((message) => message.id)
  );
  for (const suggestion of result.suggestions) {
    if (
      suggestion.source_message_ids.length === 0 ||
      suggestion.source_message_ids.some((id) => !allowedIds.has(id))
    ) {
      throw new Error("分支建议引用了不属于当前分支的消息");
    }
  }
  return result;
}

export async function compareDreamBranches(input: {
  branches: { id: string; name: string; canvas: DreamCanvas }[];
}): Promise<DreamBranchComparison> {
  const result = await generateRealityJson(
    DREAM_BRANCH_COMPARE_PROMPT,
    JSON.stringify(input.branches),
    parseDreamBranchComparison
  );
  const allowedIds = new Set(input.branches.map((branch) => branch.id));
  if (
    result.differences.some((difference) =>
      difference.branches.some(
        (branch) => !allowedIds.has(branch.branch_id)
      )
    )
  ) {
    throw new Error("分支比较引用了未知分支");
  }
  return result;
}

