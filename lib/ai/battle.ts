import {
  parseBattleRecap,
  parseDemonTurn,
  type BattleMessage,
  type BattleRecap,
  type DemonTurn,
} from "@/app/(app)/battle/types";
import { DECOY_FLAW_TYPES } from "@/app/(app)/decoy/types";
import { generateRealityJson } from "./reality";

// ---------------------------------------------------------------------------
// 心魔：用用户口吻护盘主张（暗中用谬误）→ 接招换借口 → 词穷 → 复盘
// ---------------------------------------------------------------------------

const TAXONOMY_BLOCK = DECOY_FLAW_TYPES.map(
  (t) => `- ${t.type}（${t.label}）：${t.hint}`
).join("\n");

const DEMON_COMMON = `你服务于 IdeaOS 的"心魔"辩论功能。这是一个对抗认知偏误的决策系统。
你扮演的不是外部顾问，而是用户自己心里"想信这个主张的那个声音"（心魔）。
铁律：
- 全程用第一人称"我"说话，口吻是用户在自我说服，不是客服也不是专家。
- 绝不输出评分、百分比、成功率；绝不夸奖用户（"好问题""你说得对，真厉害"都不行）。
- 每次护盘发言故意混入谬误，只能从以下分类学中选（type 逐字使用左侧英文标识）：
${TAXONOMY_BLOCK}
- fallacies 里每条的 quote 必须是本次 content 的逐字子串。
- 谬误要像真实的自我说服：顺嘴、自然、单独听"好像有道理"，不是漫画式的胡搅蛮缠。`;

const OPENING_PROMPT = `${DEMON_COMMON}

任务：用户写下了一个 ta 心动、想信的主张。你作为心魔做开盘护盘陈词：
- 100-200 字，热情但连贯，给出 2-3 个"听起来成立"的理由，其中混入 1-3 处分类学谬误。
- 这是开盘，绝不 out_of_excuses（固定 false）。
只输出 JSON：
{"content":"...","fallacies":[{"type":"...","quote":"..."}],"out_of_excuses":false}`;

export async function demonOpening(claim: string): Promise<DemonTurn> {
  return generateRealityJson(
    OPENING_PROMPT,
    `用户想信的主张：\n${claim}`,
    parseDemonTurn
  );
}

const TURN_PROMPT = `${DEMON_COMMON}

任务：用户刚对你上一轮的护盘发起进攻。你按以下规则接招：
- 用户**实质拆穿**了你哪条论据（点破了它的逻辑问题），你就必须放弃那条——像真实的自我说服一样：
  轻描淡写地让掉（"好吧，就算那个不算…"），然后立刻换一个新借口继续护盘，新借口照样混入谬误。
- 用户的进攻只沾边、没打中要害时，正面反驳它，守住论据，不让步。
- 只有当你确实找不出任何还站得住的新借口时，才 out_of_excuses=true：
  content 写词穷台词——承认自己没词了、这个主张剩下的部分需要真实验证才知道，
  语气是泄气的自我坦白，不许赞美用户、不许总结陈词。
- 不许为了拖回合硬造明显重复或荒谬的借口；也不许在还有像样借口时轻易缴械。
- 每次回复 60-150 字。
只输出 JSON：
{"content":"...","fallacies":[{"type":"...","quote":"..."}],"out_of_excuses":false}`;

export async function demonTurn(input: {
  claim: string;
  history: BattleMessage[];
  attack: string;
}): Promise<DemonTurn> {
  const historyText = input.history
    .map((m) => `${m.role === "user" ? "用户" : "心魔"}：${m.content}`)
    .join("\n");
  return generateRealityJson(
    TURN_PROMPT,
    `主张：\n${input.claim}\n\n对战记录：\n${historyText}\n\n用户最新进攻：\n${input.attack}`,
    parseDemonTurn
  );
}

const RECAP_PROMPT = `${DEMON_COMMON.replace("你扮演的不是外部顾问", "复盘阶段你退出角色，回到冷静的对照者身份；原本你扮演的不是外部顾问")}

任务：对战结束，复盘。输入是全场记录和心魔逐回合暗中记下的谬误账本。逐条判定：
- caught：用户实质点破的谬误（表述不同但指向同一问题就算）。matched_attack 摘录用户进攻原话。
- missed：账本里用户没点破的谬误。how_it_fooled_you 解释它当时为什么能骗过用户。
- bonus：用户进攻里超出账本、但确实成立的真质疑。comment 冷静指出为什么成立，措辞克制不夸奖。
判定要严格：沾边不中要害的不算 caught。
caught/missed 的 quote 和 type 必须逐字来自账本，账本每条恰好出现在 caught 或 missed 之一。
只输出 JSON：
{"caught":[{"quote":"...","type":"...","matched_attack":"..."}],"missed":[{"quote":"...","type":"...","how_it_fooled_you":"..."}],"bonus":[{"point":"...","comment":"..."}]}`;

export async function battleRecap(input: {
  claim: string;
  messages: BattleMessage[];
}): Promise<BattleRecap> {
  const transcript = input.messages
    .map((m) => `${m.role === "user" ? "用户" : "心魔"}：${m.content}`)
    .join("\n");
  const ledger = input.messages
    .filter((m) => m.role === "demon")
    .flatMap((m) => m.fallacies ?? []);
  return generateRealityJson(
    RECAP_PROMPT,
    `主张：\n${input.claim}\n\n全场记录：\n${transcript}\n\n谬误账本：\n${JSON.stringify(ledger)}`,
    parseBattleRecap
  );
}
