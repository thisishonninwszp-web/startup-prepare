import {
  DECOY_FLAW_TYPES,
  parseDecoyPlan,
  parseDecoyReveal,
  parseOwnPlanCritique,
  type DecoyPlan,
  type DecoyReveal,
  type OwnPlanCritique,
} from "@/app/(app)/decoy/types";
import { executeAiText } from "@/lib/ai-gateway";
import { generateRealityJson } from "./reality";
import { MODEL } from "./shared";

// ---------------------------------------------------------------------------
// 假方案：生成埋雷方案 → 对照揭底 → 质疑用户自己的方案 → 可选扩写定稿
// ---------------------------------------------------------------------------

const TAXONOMY_BLOCK = DECOY_FLAW_TYPES.map(
  (t) => `- ${t.type}（${t.label}）：${t.hint}`
).join("\n");

const DECOY_COMMON_RULES = `你服务于 IdeaOS 的"假方案"思维陪练功能。这是一个对抗认知偏误的决策系统。
铁律：
- 绝不输出评分、星级、百分比、成功率。
- 禁止"很有潜力""不错的想法""加油"等一切迎合性语言。
- 错漏类型只能从以下分类学中选（type 字段必须逐字使用左侧英文标识）：
${TAXONOMY_BLOCK}`;

const GENERATE_PROMPT = `${DECOY_COMMON_RULES}

任务：用户被一个问题卡住了。你要生成一份"假方案"——表面上流畅、自信、看起来专业可行，
但其中故意埋了 2-4 处符合上述分类学的错漏。用户将试图找出这些雷来锻炼独立思考。
要求：
- 方案正文分 3-5 段（如：问题重述 / 解法路径 / 资源与执行 / 如何验证），语气笃定，像一份真的方案。
- 埋的雷必须"看起来对"：混在合理内容里，不要低级到一眼假，也不要玄学到无法识破。
- 每处雷的 quote 必须是某段 content 里的逐字子串（一字不差），section 写所在段的 heading。
- 除埋下的雷以外，其余内容尽量站得住脚——雷越少越隐蔽，练习价值越高。
只输出 JSON：
{"sections":[{"heading":"...","content":"..."}],"planted_flaws":[{"section":"...","quote":"...","type":"...","why_wrong":"..."}]}`;

export async function generateDecoyPlan(problem: string): Promise<DecoyPlan> {
  return generateRealityJson(
    GENERATE_PROMPT,
    `用户卡住的问题：\n${problem}`,
    parseDecoyPlan
  );
}

const REVEAL_PROMPT = `${DECOY_COMMON_RULES}

任务：揭底。对照"埋雷清单"和"用户的质疑"，逐条判定：
- caught：用户实质性识破的雷（哪怕表述不同，只要指向同一问题就算抓到）。matched_challenge 摘录用户质疑中对应的原话。
- missed：用户没发现的雷。why_plausible 解释它为什么看起来对，why_wrong 解释它实际为什么错。
- bonus：用户提出的、埋雷清单之外但确实成立的真问题。comment 冷静指出它为什么成立——这是独立思考的证据，措辞克制，不夸奖。
判定要严格：似是而非、只沾边不指向问题本质的质疑不算 caught。
caught/missed 的 quote 和 type 必须逐字来自埋雷清单，每处雷恰好出现在 caught 或 missed 之一。
只输出 JSON：
{"caught":[{"quote":"...","type":"...","matched_challenge":"..."}],"missed":[{"quote":"...","type":"...","why_plausible":"...","why_wrong":"..."}],"bonus":[{"point":"...","comment":"..."}]}`;

export async function revealDecoy(input: {
  problem: string;
  plan: DecoyPlan;
  challenges: string;
}): Promise<DecoyReveal> {
  return generateRealityJson(
    REVEAL_PROMPT,
    `问题：\n${input.problem}\n\n假方案全文：\n${JSON.stringify(input.plan.sections)}\n\n埋雷清单：\n${JSON.stringify(input.plan.planted_flaws)}\n\n用户的质疑：\n${input.challenges}`,
    parseDecoyReveal
  );
}

const CRITIQUE_PROMPT = `${DECOY_COMMON_RULES}

任务：用户拆完假方案后写下了自己的方案。用同一套错漏分类学做一次性对抗质疑：
- suspected_flaws：方案中疑似踩雷的表述。quote 摘录方案原文（尽量逐字），type 标分类，comment 说明为什么这是雷。
- open_questions：方案没有回答、但决定生死的具体问题。必须是有明确答案、能被证伪的问题，不是修辞性反问。
你的目标是找出这个方案会死的理由，不是让用户感觉良好。没有实质问题就少写，不硬凑。
只输出 JSON：
{"suspected_flaws":[{"quote":"...","type":"...","comment":"..."}],"open_questions":["..."]}`;

export async function critiqueOwnPlan(input: {
  problem: string;
  ownPlan: string;
}): Promise<OwnPlanCritique> {
  return generateRealityJson(
    CRITIQUE_PROMPT,
    `问题：\n${input.problem}\n\n用户自己的方案：\n${input.ownPlan}`,
    parseOwnPlanCritique
  );
}

const EXPAND_PROMPT = `${DECOY_COMMON_RULES}

任务：把用户自己写的方案扩写成一份结构化的完整方案（Markdown，用 ## 分节）。
护栏（违反即失败）：
- 只允许重组结构、补充执行细节和步骤，绝不替换、扭转或新增用户没有表达过的核心判断。
- 你补充的每一处假设、数据或前提，必须在句尾标注"⚠ 待验证"，不得以事实口吻出现。
- 对 AI 质疑中列出的疑点，只能如实保留为"待回答的问题"小节，不许替用户给出答案。
- 全文禁止任何评价性语言（好/差/有潜力都不行）。
- 结尾必须原样附上这一行："> 提示：这份方案还没有接触过任何真实用户。它值多少钱，由下一次真实接触决定。"
只输出 Markdown 正文，不要代码块包裹。`;

export async function expandOwnPlan(input: {
  problem: string;
  ownPlan: string;
  critique: OwnPlanCritique | null;
}): Promise<string> {
  return executeAiText(
    {
      operation: "decoy_expand",
      module: "unknown",
      timeoutMs: 60_000,
    },
    {
      model: MODEL,
      contents: `问题：\n${input.problem}\n\n用户自己的方案：\n${input.ownPlan}\n\nAI 质疑（保留为待回答问题，不要替用户回答）：\n${JSON.stringify(input.critique ?? { suspected_flaws: [], open_questions: [] })}`,
      config: {
        systemInstruction: EXPAND_PROMPT,
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 8192,
      },
    }
  );
}
