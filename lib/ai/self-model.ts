import { generateRealityJson } from "./reality";
import {
  AXIS_NAMES,
  DISPOSITIONS,
  type DispositionAxis,
} from "@/lib/domains/self-model/dispositions";

// ---------------------------------------------------------------------------
// 自我模块唯一的 AI 调用：提名气质。
//
// 为什么只有这一处：气质是整套系统里**唯一没有分母**的一层 —— 它本来就是
// 自述，进不了任何计算，所以让 AI 参与提名不会污染任何数字。
// 属性、特性、档位、品级一律由代码算，AI 碰不到，这条线不动。
//
// 硬约束（写进 prompt，也在解析器里再挡一次）：
//   1. 每条提名必须自带「怎么验」—— 一句到期能判真假的观察。
//      写不出验法的，就只是一个形容词，不许出现。
//   2. 不许下结论、不许夸人、不许输出任何数字或程度词。
//   3. 提的是**候选**，一律进待确认队列，用户点了才入库。
// ---------------------------------------------------------------------------

export type DispositionNomination = {
  name: string;
  axis: DispositionAxis;
  claim: string;
  test: string;
  /** 为什么提这条：指向用户已认领的哪几条，或哪段自述。 */
  because: string;
};

const AXIS_BLOCK = (Object.keys(AXIS_NAMES) as DispositionAxis[])
  .map((axis) => `- ${axis}（${AXIS_NAMES[axis]}）`)
  .join("\n");

const SYSTEM = `你服务于 IdeaOS 的"自我角色卡"里的气质一栏。

气质是这个系统里唯一允许来自自述的东西 —— 它不进任何计算，不影响属性、
不参与品级。它的用处只有一个：给一个人一个说得出口的短名字，
然后**被翻译成一句可证伪的观察去验**。

你的任务：读用户已经认领的气质和他写下的自述，提名**他可能漏掉的**几条。

铁律：
- 每条必须给出 test：一句到期能判真假的观察，必须能从行为记录里查。
  写不出 test 的条目直接不要输出 —— 那只是形容词。
- 禁止任何评价性语言：不许出现"很有""非常""优秀""不错""擅长""潜力"。
- 禁止输出任何数字、比例、程度词、性格类型名（不许写 INTP、i人、内向者）。
- claim 用第一人称、口语、一句话，像本人会说的原话。
- name 二到五个字，具体、有画面，不用抽象形容词。
- 只提**没被认领过、也不在现有库里**的角度；重复的不要。
- 轴只能从下面选：
${AXIS_BLOCK}

输出 JSON：{"nominations":[{"name","axis","claim","test","because"}]}，
最多 6 条。宁可少，不许凑。`;

function parseNominations(value: unknown): DispositionNomination[] {
  const root = value as { nominations?: unknown };
  if (!Array.isArray(root?.nominations)) return [];
  const axes = new Set(Object.keys(AXIS_NAMES));
  const banned = /很有|非常|优秀|不错|擅长|潜力|天赋异禀|INTP|[0-9]/;

  return root.nominations
    .map((item) => item as Record<string, unknown>)
    .filter((item) => {
      const name = String(item.name ?? "").trim();
      const claim = String(item.claim ?? "").trim();
      const test = String(item.test ?? "").trim();
      const axis = String(item.axis ?? "").trim();
      // 没有验法的一律丢掉 —— 这条不在 prompt 里客气，在这里硬挡。
      if (!name || !claim || !test || test.length < 6) return false;
      if (!axes.has(axis)) return false;
      if (banned.test(name) || banned.test(claim)) return false;
      return true;
    })
    .map((item) => ({
      name: String(item.name).trim(),
      axis: String(item.axis).trim() as DispositionAxis,
      claim: String(item.claim).trim(),
      test: String(item.test).trim(),
      because: String(item.because ?? "").trim(),
    }))
    .slice(0, 6);
}

export async function nominateDispositions(input: {
  claimed: { name: string; claim: string }[];
  declarations: string[];
  /** 已有库里的名字，避免重复提名。 */
  existingNames: string[];
}): Promise<DispositionNomination[]> {
  const claimedBlock =
    input.claimed.length > 0
      ? input.claimed.map((item) => `- ${item.name}：${item.claim}`).join("\n")
      : "（还没有认领任何一条）";

  const contents = `已认领的气质：
${claimedBlock}

他写下过的自述：
${input.declarations.length > 0 ? input.declarations.join("\n") : "（没有）"}

库里已有的名字（不要重复）：
${input.existingNames.join("、")}

请提名他可能漏掉的角度。`;

  return generateRealityJson(SYSTEM, contents, parseNominations);
}

/** 库里现有的全部名字，用来告诉模型别重复。 */
export function existingDispositionNames(): string[] {
  return DISPOSITIONS.map((item) => item.name);
}

// ---------------------------------------------------------------------------
// 第二处 AI 调用：拆开一项技能。
//
// 为什么这一处也放行：用户说不出"要成为这个领域的专家，需要掌握哪些小技能",
// 那本来就是他没有的知识量 —— 这正是模型该出力的地方。
//
// 它仍然不碰任何数字：
//   拆解只是**一张待办清单**，四级各自的标准 + 每级下面几个小技能。
//   哪一个亮、凭什么亮，只由用户写下的 proof 决定，AI 一个字碰不到。
//   提名不写库，用户逐条改过、收下的才落到 self_skill_stages。
//
// 解析器里再挡一次（prompt 会被无视，代码不会）：
//   1. 每个小技能必须有 test，而且 test 必须是**一次能指认的事**。
//      "熟悉 X""了解 Y""掌握 Z 的基本原理"一律丢掉 —— 这些判不了真假。
//   2. 不许出现分数、百分比、等级数字、"精通度"这种词。
//   3. 每级 2–4 个，四级齐全，缺级的整份作废。
// ---------------------------------------------------------------------------

export type StageNomination = {
  tier: number;
  name: string;
  standard: string;
  nodes: { name: string; test: string }[];
};

const STAGE_NAMES = ["入门", "基础", "精通", "专家"];

const DECOMPOSE_SYSTEM = `你在帮一个人拆开一项技能，拆成他能一格格点亮的小技能。

他的处境：他知道自己想会这项手艺，但**不知道这门手艺到底由哪些小技能构成**，
也不知道到什么程度才算入门、才算专家。这正是你该补上的那部分知识。

拆成四级：${STAGE_NAMES.join(" → ")}。
每一级要给出：
- standard：过了这一级算什么。一句话，说的是"能做成什么样的事"，
  不是"掌握了什么知识"。
- nodes：这一级下面 2 到 4 个小技能。点齐才算过这一级。
  每个小技能有 name（二到六个字，具体，像一个动作）和
  test（一句话，说清楚**做到过一次是什么样子**）。

test 的硬标准 —— 写不出就别写这条：
- 必须是一件能指着说"就是那次"的事。
- 禁止"熟悉""了解""理解""掌握……原理""有意识地""能够较好地"这类词，
  它们判不了真假。
- 禁止任何数字化的程度：不许打分、不许百分比、不许"精通度""水平"。
- 允许出现次数和时长（"连续四周""三次以上"），那是能数的。

其它规矩：
- 四级之间要**真的有台阶**：入门是自己做成一次，专家是在变化和压力下还成立、
  或者能让别人也做成。不要把同一件事换四种说法。
- 具体到这一行的真实做法，不要写通用鸡汤。
- 不许夸人，不许评价，不许写"很有潜力"这类话。
- 中文，口语，短句。

输出 JSON：
{"stages":[{"tier":1,"standard":"…","nodes":[{"name":"…","test":"…"}]}, …]}
必须四级齐全。`;

const VAGUE = /熟悉|了解|理解|掌握[^，。]{0,6}原理|有意识|较好地|一定程度|水平|精通度|评分|打分|[0-9]{1,3}\s*[%分]/;

/** 导出只为测试：这些闸门比 prompt 硬。 */
export function parseStages(value: unknown): StageNomination[] {
  const root = value as { stages?: unknown };
  if (!Array.isArray(root?.stages)) return [];

  const byTier = new Map<number, StageNomination>();
  for (const raw of root.stages) {
    const item = raw as Record<string, unknown>;
    const tier = Number(item.tier);
    if (!Number.isInteger(tier) || tier < 1 || tier > 4) continue;
    const standard = String(item.standard ?? "").trim();
    if (standard.length < 4) continue;

    const nodes = (Array.isArray(item.nodes) ? item.nodes : [])
      .map((entry) => entry as Record<string, unknown>)
      .map((entry) => ({
        name: String(entry.name ?? "").trim(),
        test: String(entry.test ?? "").trim(),
      }))
      // 没有验法、或者验法是个形容词的，直接丢。
      .filter((entry) => entry.name.length >= 2 && entry.test.length >= 6)
      .filter((entry) => !VAGUE.test(entry.test))
      .slice(0, 4);

    if (nodes.length < 2) continue;
    byTier.set(tier, {
      tier,
      name: STAGE_NAMES[tier - 1],
      standard,
      nodes,
    });
  }

  // 缺级的整份作废：三级半的树点起来会卡死在中间。
  if (byTier.size < 4) return [];
  return [1, 2, 3, 4].map((tier) => byTier.get(tier)!);
}

export async function decomposeSkill(input: {
  name: string;
  /** 这项技能的大白话解释。 */
  gloss: string;
  /** 前置技能的名字，用来提示它该建在什么之上。 */
  requires: string[];
  /** 用户的处境，一两句。让拆解落到他的行当里。 */
  context: string;
}): Promise<StageNomination[]> {
  const contents = `要拆的技能：${input.name}
它指的是：${input.gloss}
${
  input.requires.length > 0
    ? `它建立在这些技能之上：${input.requires.join("、")}`
    : "它是一项基础技能，没有前置。"
}

这个人的处境：${input.context || "（没写）"}

请把它拆成四级，每级带标准和 2–4 个小技能。`;

  return generateRealityJson(DECOMPOSE_SYSTEM, contents, parseStages);
}
