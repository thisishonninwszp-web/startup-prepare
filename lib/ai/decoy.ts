import {
  DECOY_FLAW_TYPES,
  parseDecoyPlan,
  parseDecoyReveal,
  parseOwnPlanCritique,
  type DecoyPlan,
  type DecoyReveal,
  type DecoyStyle,
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

// 三档画风：文风 + 离谱程度（= 雷的隐蔽度）绑在一起，作为练习难度档位。
const STYLE_BLOCKS: Record<DecoyStyle, string> = {
  consultant: `画风：一本正经（最难档）。
- 方案体，分 3-5 段（如：问题重述 / 解法路径 / 资源与执行 / 如何验证），语气笃定专业，像一份真的方案。
- 埋 2-3 处雷，埋得深：混在完全站得住脚的内容里，不细想根本看不出来。
- 除埋下的雷以外，其余内容尽量正确——雷越少越隐蔽，练习价值越高。`,
  rambling: `画风：想到哪说到哪（中间档）。
- 写成创业者深夜语音转文字那种碎碎念：一个念头接一个念头、中途打断自己、突然跑题又绕回来、
  时不时自我说服（"对吧？肯定是这样"）。多用口语："就是说""反正""对了还有""你懂吧"。
- 不要正式章节。heading 写成念头片段（如"就是说啊""然后我突然想到""等等，还有个事"），
  content 是连贯的口语独白，一段一个念头，共 3-5 段。
- 埋 2-4 处雷，藏在顺嘴带过的断言和自我说服里——念头是乱的，但每处雷单独看要"好像有道理"。
- 乱是文风的乱，不是内容的胡编：没埋雷的部分要是真实可信的思考。`,
  unhinged: `画风：一眼假（热身档）。
- 形式上是一份正经方案：分 3-5 段（问题重述 / 解法路径 / 资源与执行 / 如何验证），
  结构清晰、语气冷静专业、行文流畅——壳子必须像模像样，不许东拉西扯。
- 但方案的核心决策明显不可行，读者一眼就能看出"这不行"：比如资源账明显算不过来
  （预算 500 元做全国地推）、把最难的一步当成已经解决（"用户增长起来之后…"却没说怎么增长）、
  时间表离谱（两周做完需要半年的事）、把偶然个例直接当成方法论照抄。
- 埋 3-4 处雷，要明显——练习点不是"找不找得到"，而是逼用户把"它为什么死"用因果说清楚。
- 明显 ≠ 低级：不许病句、不许常识性胡说（如"地球有 80 亿个国家"），
  每处雷都必须是决策层面的错误，且在真实创业者身上真的会发生。`,
};

function generatePrompt(style: DecoyStyle): string {
  return `${DECOY_COMMON_RULES}

任务：用户被一个问题卡住了。你要生成一份"假方案"——看起来说得通，
但其中故意埋了若干处符合上述分类学的错漏。用户将试图找出这些雷来锻炼独立思考。

${STYLE_BLOCKS[style]}

通用要求：
- 每处雷的 quote 必须是某段 content 里的逐字子串（一字不差），section 写所在段的 heading。
- 埋的雷必须"看起来对"：不要低级到一眼假，也不要玄学到无法识破。
只输出 JSON：
{"sections":[{"heading":"...","content":"..."}],"planted_flaws":[{"section":"...","quote":"...","type":"...","why_wrong":"..."}]}`;
}

export async function generateDecoyPlan(
  problem: string,
  style: DecoyStyle
): Promise<DecoyPlan> {
  return generateRealityJson(
    generatePrompt(style),
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
