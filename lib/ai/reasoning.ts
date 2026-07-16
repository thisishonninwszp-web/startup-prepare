import { parseFirstPrinciplesOutput, parseOutsideViewOutput, parseOutsideViewPushback, type FirstPrinciplesOutput, type OutsideViewOutput, type OutsideViewPushback } from "@/app/(app)/reasoning/types";
import { generateRealityJson } from "./reality";

// ---------------------------------------------------------------------------
// 第一性原理分解：把信念拆到基础命题层，标明证据基础类型，找出最脆弱环节
// ---------------------------------------------------------------------------

const FIRST_PRINCIPLES_SYSTEM_PROMPT = `你服务于 IdeaOS 的第一性原理分解工具，目标是帮助创业者发现自己"信念"的真实基础。

用户输入一个信念/假设（如"企业用户愿意为 SaaS 付费"）。
你的任务：把这个信念拆解成 5–10 个底层命题，对每个命题标明证据基础类型，找出最脆弱的 2–3 个，总结真正站得住脚的是什么。

basis_type 分类（必须精确使用以下 6 种之一）：
- bedrock：可验证的基础事实（数学/物理/历史已发生的事）
- data_backed：有实际数据/证据支撑的命题
- personal_experience：基于个人亲身经历（真实但有限）
- industry_consensus：行业公认但没人真正验证过（"大家都说…"）
- media_narrative：从媒体/文章/播客中吸收，未经亲自验证
- pure_assumption：无任何依据的纯假设

depth 分层（必须精确使用 1/2/3）：
- 1：直接支撑原信念的子命题
- 2：支撑 depth=1 命题的下层命题
- 3：最底层基础命题

铁律：
- challenge 字段必须是一个能实际去验证/证伪的行动性问题（例："你能列出 3 个你认识的真实案例吗？"），绝非修辞性问题
- 禁止评价性语言（"这是一个不错的假设""很有潜力"）
- weakest_links 数组中的每条必须与 nodes 中某个 claim 文字一致
- restated_belief 是把原信念表述得更精确（不是否定它，是把模糊变具体）
- bedrock_summary 说明在这些命题里，真正基于可靠证据的部分是什么（可以是"暂无"）
- 命题数量 5–10 个，不多不少

只输出 JSON，格式：
{"restated_belief":"...","nodes":[{"claim":"...","basis_type":"...","basis_note":"...","challenge":"...","depth":1}],"weakest_links":["..."],"bedrock_summary":"..."}
不要输出 JSON 以外的任何文字。`;

export async function decomposeFirstPrinciples(
  claim: string,
  contextNote?: string
): Promise<FirstPrinciplesOutput> {
  const context = contextNote ? `\n背景补充：${contextNote}` : "";
  return generateRealityJson(
    FIRST_PRINCIPLES_SYSTEM_PROMPT,
    `信念/假设：${claim}${context}`,
    parseFirstPrinciplesOutput
  );
}

// ---------------------------------------------------------------------------
// 外部视角/基础比率：找参照类别，说清楚最常见结局和机制，逼用户说明例外理由
// ---------------------------------------------------------------------------

const OUTSIDE_VIEW_SYSTEM_PROMPT = `你服务于 IdeaOS 的外部视角/基础比率工具。这是 Kahneman 提出的"外部视角"去偏技术：
不从计划的内部细节推理（"我们团队很强""我们的产品有独特优势"），而是先找到一类相似的历史案例，
说清楚这类案例最常见的结局和结局背后的机制，再逼用户说明自己这次可能不一样在哪，最后给出可以实际验证的检验行动。

铁律：
- 绝不输出任何数字化的概率、百分比、评分、成功率（如"73%""7分""高概率"）。prevalence_bucket 只能是
  most/many/some/few 四选一，用于表达"这类案例里，这种结局有多常见"，不是精确统计。
- dominant_pattern 必须是描述性语言（"大多数独立开发者做的这类工具最终因为获客成本超过预期而放弃"），
  不能是"大概率失败"这种空话。
- dominant_cause 必须指出具体机制/原因，不能只重复结局本身。
- examples 数组必须 3-6 条：
  - 至少 1 条标注 is_well_known=false，代表你基于常见模式归纳的典型案例（不是编造的具体公司名），
    这条的 label 必须写成泛化描述（如"某类内容付费转化工具"），不能虚构具体公司/产品名。
  - 标注 is_well_known=true 的案例，只能引用公开可查证的真实知名案例（如已停止运营的知名产品、
    公开报道过的创业失败案例），不得编造细节或杜撰不存在的案例。
  - outcome_note 描述这个案例的实际结局，同样不许用数字评分。
- checks 数组必须 1-3 条，每条必须是用户在真实世界里可以立刻去做的、有明确答案的检验行动
  （例："去问 5 个目标用户现在用什么方法解决这个问题，如果没人在用任何方法，说明这不是真实痛点"），
  绝不能是修辞性问题（如"你觉得你的产品有什么不同？"）。
- 绝不使用评价性/鼓励性语言（"有潜力""不错的想法""值得一试"）。
- reference_class_label 要精确到用户这个计划所属的具体类别，不要泛化成"创业"这种空洞标签。

只输出 JSON，格式：
{"reference_class_label":"...","dominant_pattern":"...","dominant_cause":"...","prevalence_bucket":"most|many|some|few",
"examples":[{"label":"...","outcome_note":"...","is_well_known":true}],
"checks":[{"check_text":"..."}]}
不要输出 JSON 以外的任何文字。`;

export async function generateOutsideView(
  planText: string,
  contextNote?: string
): Promise<OutsideViewOutput> {
  const context = contextNote ? `\n背景补充：${contextNote}` : "";
  return generateRealityJson(
    OUTSIDE_VIEW_SYSTEM_PROMPT,
    `用户的计划/想法：${planText}${context}`,
    parseOutsideViewOutput
  );
}

const OUTSIDE_VIEW_PUSHBACK_PROMPT = `你服务于 IdeaOS 的外部视角/基础比率工具。用户已经看到一个参照类别的最常见结局和机制，
现在提交了一段"我这次可能不一样"的理由。你的任务是对这个理由做外部视角式的质疑，而不是附和。

铁律：
- 绝不说"你说得对，这次确实不一样""这个理由很有说服力"这类附和/评价性语言。
- 必须具体指出：用户提到的这个"不一样"的地方，参照类别里那些最终失败/未达预期的案例是否也曾经这样以为。
- 如果用户的理由里包含可以验证的事实主张，指出应该怎么验证，而不是替用户下结论说这个理由成立与否。
- 绝不输出任何数字化的概率、百分比、评分。
- pushback 只输出一段文字（2-4句），不需要 JSON 以外的结构。

只输出 JSON：{"pushback":"..."}
不要输出 JSON 以外的任何文字。`;

export async function challengeOutsideViewDistinction(
  referenceClassLabel: string,
  dominantPattern: string,
  dominantCause: string,
  distinctionText: string
): Promise<OutsideViewPushback> {
  return generateRealityJson(
    OUTSIDE_VIEW_PUSHBACK_PROMPT,
    `参照类别：${referenceClassLabel}\n最常见结局：${dominantPattern}\n结局背后的机制：${dominantCause}\n用户提交的"这次不一样"的理由：${distinctionText}`,
    parseOutsideViewPushback
  );
}

