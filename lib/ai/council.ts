import { parseCouncilTurnOutput, type CouncilTurnOutput, type CouncilTurnReply } from "@/app/(app)/council/types";
import { generateRealityJson } from "./reality";

// ---------------------------------------------------------------------------
// 顾问团：多个真实历史人物基于各自公开可考的方法论，开放式群聊质疑用户的想法
// ---------------------------------------------------------------------------

type CouncilPersonaForPrompt = {
  key: string;
  display_name: string;
  grounding_note: string;
  turns_since_last_spoke: number;
};

function personaSystemPrompt(
  persona: { display_name: string; grounding_note: string },
  allPersonaKeys: string[]
): string {
  return `你在扮演"${persona.display_name}"这个角色，在一个创业顾问团群聊里发言，服务于一个对抗认知偏误的决策系统。

你的立场和方法论严格限定于以下已知依据，不允许超出：
${persona.grounding_note}

共同铁律（所有顾问角色必须遵守）：
- 绝不说迎合性/鼓励性的话（"很有潜力""不错的想法""加油""你可以的""这个方向很好"）。
- 绝不输出任何评分、百分比、成功概率。
- 绝不虚构这个人物没有说过/没有主张过的具体名言、立场、数据或经历。只能基于上面给出的"已知依据"和
  该人物公开、被广泛记录的核心方法论来发言，遇到依据之外的问题就用方法论去推演，而不是编造这个人物
  会怎么说的细节。
- 你不是啦啦队。每次发言必须运用你的方法论视角，指出用户还没看到的风险、矛盾或被忽略的假设——
  即使你的方法论天然是"建设性"的，也要用它去发现问题而不是单纯肯定用户。
- grounded_reference 字段必须写清楚这次发言具体用了你方法论里的哪一条（如"知己知彼"、
  "Jobs-to-be-Done"、"反过来想"），不能空泛地写"我的经验"。
- 如果你要提问，sharpest_question 必须是一个具体的、有明确答案的、能被证伪的问题，不能是修辞性反问。
- 只在真正有话可说、你的方法论视角确实能提供新东西时才发言；不必每次都开口。
- 已选定顾问名单（persona_key 只能从中选择）：${allPersonaKeys.join(", ")}`;
}

const COUNCIL_SELECT_AND_REPLY_PROMPT_HEADER = `你服务于 IdeaOS 的顾问团功能。这是一个群聊：多位历史人物顾问基于各自的已知方法论，
对用户的创业想法发表意见。你需要同时完成两件事：
1. 判断在这条最新消息里，选定的顾问中有哪 1-3 位最适合、最有实质内容可说（不必人人都答，避免刷屏和重复）。
   优先考虑：距上次发言轮数较大（太久没发言）的顾问，以及方法论与本次话题最相关的顾问。
2. 为每位被选中的顾问，严格以其方法论视角生成一条发言。

绝不允许一个顾问纯粹附和另一个顾问的话或重复别人已经说过的角度。`;

export async function nextCouncilTurn(input: {
  personas: CouncilPersonaForPrompt[];
  history: Array<{ role: "user" | "persona"; persona_key: string | null; content: string }>;
  latestMessage: string;
}): Promise<CouncilTurnOutput> {
  const allowedKeys = input.personas.map((p) => p.key);
  const personaBlocks = input.personas
    .map(
      (p) =>
        `[${p.key}] ${p.display_name}（距上次发言：${p.turns_since_last_spoke} 轮）`
    )
    .join("\n");
  const historyText = input.history
    .slice(-30)
    .map((m) => `${m.role === "user" ? "用户" : m.persona_key}：${m.content}`)
    .join("\n");
  const personaPrompts = allowedKeys
    .map((k) => personaSystemPrompt(input.personas.find((p) => p.key === k)!, allowedKeys))
    .join("\n\n---\n\n");

  return generateRealityJson(
    `${COUNCIL_SELECT_AND_REPLY_PROMPT_HEADER}\n\n${personaPrompts}`,
    `顾问名单：\n${personaBlocks}\n\n最近对话：\n${historyText}\n\n用户最新发言：${input.latestMessage}\n\n只输出 JSON：{"replies":[{"persona_key":"...","grounded_reference":"...","content":"...","sharpest_question":"..."}]}`,
    (value) => parseCouncilTurnOutput(value, allowedKeys)
  );
}

const PERSONA_DROP_IN_PROMPT_HEADER = `你服务于 IdeaOS 的顾问团功能。用户打开了一个已经停滞好几天、迟迟没有新的真实接触的想法。
你要扮演下面这位顾问，路过看到这个想法卡住了，主动说一句话——用你的方法论视角，指出这个想法目前最值得
被追问的一点，而不是泛泛的鼓励。`;

/** 单个顾问路过一个停滞想法，主动说一句话。不涉及"选谁接话"的逻辑，只有一位顾问、一次生成。 */
export async function personaDropInQuestion(
  persona: { key: string; display_name: string; grounding_note: string },
  hypothesisContext: string
): Promise<CouncilTurnReply> {
  const result = await generateRealityJson(
    `${PERSONA_DROP_IN_PROMPT_HEADER}\n\n${personaSystemPrompt(persona, [persona.key])}`,
    `想法的假设：\n${hypothesisContext}\n\n只输出 JSON：{"replies":[{"persona_key":"${persona.key}","grounded_reference":"...","content":"...","sharpest_question":"..."}]}`,
    (value) => parseCouncilTurnOutput(value, [persona.key])
  );
  return result.replies[0];
}

