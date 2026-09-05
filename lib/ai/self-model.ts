import { generateRealityJson } from "./reality";
import { MAIN_KEYS, type MainKey } from "@/lib/domains/self-model/panel";
import {
  SKILL_DEFS,
  SKILL_GROUPS,
  SKILL_GROUP_NAMES,
  SKILL_LAYERS,
  SKILL_LAYER_GLOSS,
  SKILL_LAYER_NAMES,
  type SkillGroup,
  type SkillLayer,
} from "@/lib/domains/self-model/skills";
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

/**
 * 以「能…」「会…」开头的不是判据，是能力声明。
 *
 * 「能识别出团队成员的成长需求」——这句话没有哪一天为真、哪一天为假，
 * 它永远可以被认领。判据要说的是**做到过一次是什么样子**：
 * 「上周三谁跟你说了他想学什么，你记下来并给了一个具体资源」。
 */
const CLAIM = /^(能|会|可以|善于|懂得|应当|需要|具备)/;

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
      .filter((entry) => !VAGUE.test(entry.test) && !CLAIM.test(entry.test))
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

// ---------------------------------------------------------------------------
// 第三处 AI 调用：提名骨架上缺的技能。
//
// 拆解回答的是"这门手艺由哪些小技能构成"，这一处回答更前面的一个问题：
// **我到底该会哪些手艺**。用户说不出来是正常的 —— 那是他没有的知识量。
//
// 危险在于模型会顺着方向硬凑一堆听着高级的名词。所以闸门比上一处更密：
//   1. 名字必须是**朴素的双字或三字词**，不许是短语、不许带形容词。
//   2. gloss 必须是一句能想象出画面的白话，不许是同义反复。
//   3. requires 只能引用**已经存在**的技能 key，且层不能高于自己 ——
//      写错一条就会让树出现环，所以这里直接丢，不做修正。
//   4. 必须自带三档 milestones，每档一句能判真假的现实标准；
//      没有它，这项技能落进树里就是个点不动的空壳。
//   5. 已经存在的名字或近义重复不要 —— 树的价值不在多。
// ---------------------------------------------------------------------------

export type SkillNomination = {
  key: string;
  name: string;
  gloss: string;
  group: SkillGroup;
  main: MainKey;
  layer: SkillLayer;
  requires: string[];
  milestones: { name: string; test: string }[];
  /** 为什么这一项该在树上，而现在没有。 */
  because: string;
};

const GROUP_BLOCK = SKILL_GROUPS.map(
  (group) => `- ${group}（${SKILL_GROUP_NAMES[group]}）`
).join("\n");

const LAYER_BLOCK = SKILL_LAYERS.map(
  (layer) => `- ${layer}（${SKILL_LAYER_NAMES[layer]}）：${SKILL_LAYER_GLOSS[layer]}`
).join("\n");

const NOMINATE_SYSTEM = `你在替一个人补他的技能树。

他给你一个方向，你的任务是：指出**这棵树上缺的、但那个方向真的需要的手艺**。
他说不出这些名字是正常的 —— 一个人本来就不知道自己不知道什么。

树的结构：
- 层（纵轴，越往上越深）：
${LAYER_BLOCK}
- 领域（横轴）：
${GROUP_BLOCK}
- 主属性只能从这九个里选：STR CON DEX INT WIS CHA WIL LCK RES

命名铁律：
- 朴素的双字词，最多三字。像 D&D 的技能表：调查、洞悉、说服、医药。
- 不许是短语（"主动沟通能力"）、不许带形容词、不许生造文言。
- 一眼看不出意思没关系，gloss 会解释；但名字本身必须是个**现成的词**。

每一项必须给出：
- key：小写英文，一个词，和已有的不重复。
- gloss：一句白话，说清这门手艺到底在干什么，要能想象出画面。
- layer / group / main。
- requires：它建在哪些**已有技能**之上。只能写下面给你的 key，
  而且它们的层不能高于这一项。想不出合适前置就给空数组。
- milestones：三档，从浅到深。每一档 name 两到四字，
  test 是一句**到期能判真假**的现实标准 —— 说的是"做到过一次是什么样子"，
  不是"熟悉""了解""掌握原理"。也不许以"能…""会…"开头：
  那是能力声明，永远可以被认领，判不了真假。
  禁止任何打分、百分比、程度词。
- because：为什么这一项对他给的方向是必要的，一句话。

其它：
- 只提**真的缺**的。已有的名字、以及和它们只差一个字的说法，一律不要。
- 宁可两条，不许凑六条。树的价值不在多。
- 不许评价这个人，不许写"很有潜力"这类话。

输出 JSON：
{"skills":[{"key","name","gloss","group","main","layer","requires":[],"milestones":[{"name","test"}],"because"}]}
最多 5 条。`;

/** 导出只为测试。 */
export function parseSkillNominations(value: unknown): SkillNomination[] {
  const root = value as { skills?: unknown };
  if (!Array.isArray(root?.skills)) return [];

  const known = new Map(SKILL_DEFS.map((def) => [def.key, def]));
  /**
   * 近义重名：「带人」和已有的「带教」只差一个字，收进来就是同一门手艺占两格。
   *
   * 判定收窄到**同一个领域内**：中文两字词共用一个字太常见了
   * （定价 / 定题、取舍 / 取证），跨领域撞字多半是巧合，同领域撞字多半是重复。
   */
  const tooClose = (name: string, group: string) =>
    SKILL_DEFS.filter((def) => def.group === group).some((def) => {
      const shared = [...name].filter((char) => def.name.includes(char)).length;
      return shared * 2 >= Math.min(name.length, def.name.length);
    });
  const groups = new Set<string>(SKILL_GROUPS);
  const layers = new Set<string>(SKILL_LAYERS);
  const mains = new Set<string>(MAIN_KEYS);
  const taken = new Set<string>();

  return root.skills
    .map((item) => item as Record<string, unknown>)
    .map((item) => {
      const key = String(item.key ?? "").trim().toLowerCase();
      const name = String(item.name ?? "").trim();
      const gloss = String(item.gloss ?? "").trim();
      const group = String(item.group ?? "").trim();
      const main = String(item.main ?? "").trim();
      const layer = String(item.layer ?? "").trim();

      if (!/^[a-z][a-z0-9]{1,20}$/.test(key)) return null;
      if (known.has(key) || taken.has(key)) return null;
      // 名字必须是个词，不是一句话。
      if (name.length < 2 || name.length > 3) return null;
      if (tooClose(name, group)) return null;
      if (gloss.length < 6) return null;
      if (!groups.has(group) || !layers.has(layer) || !mains.has(main)) {
        return null;
      }

      const layerRank = SKILL_LAYERS.indexOf(layer as SkillLayer);
      const requires = (Array.isArray(item.requires) ? item.requires : [])
        .map((entry) => String(entry).trim())
        // 前置必须真的存在，而且不能踩在比自己更高的层上 —— 否则树会出环。
        .filter((entry) => {
          const def = known.get(entry);
          return (
            def !== undefined &&
            SKILL_LAYERS.indexOf(def.layer) <= layerRank
          );
        })
        .slice(0, 4);

      const milestones = (Array.isArray(item.milestones) ? item.milestones : [])
        .map((entry) => entry as Record<string, unknown>)
        .map((entry) => ({
          name: String(entry.name ?? "").trim(),
          test: String(entry.test ?? "").trim(),
        }))
        .filter((entry) => entry.name.length >= 2 && entry.test.length >= 6)
        .filter((entry) => !VAGUE.test(entry.test) && !CLAIM.test(entry.test))
        .slice(0, 3);
      // 三档不齐就是个点不动的空壳。
      if (milestones.length < 3) return null;

      taken.add(key);
      return {
        key,
        name,
        gloss,
        group: group as SkillGroup,
        main: main as MainKey,
        layer: layer as SkillLayer,
        requires,
        milestones,
        because: String(item.because ?? "").trim(),
      };
    })
    .filter((item): item is SkillNomination => item !== null)
    .slice(0, 5);
}

export async function nominateSkills(input: {
  /** 用户给的方向，一句话。 */
  direction: string;
  /** 他已经点亮到某一级的技能名，让模型知道他站在哪。 */
  reached: string[];
}): Promise<SkillNomination[]> {
  const catalogue = SKILL_DEFS.map(
    (def) => `${def.key}｜${def.name}｜${def.layer}｜${def.group}｜${def.gloss}`
  ).join("\n");

  const contents = `他给的方向：${input.direction}

他已经走出来的技能：${
    input.reached.length > 0 ? input.reached.join("、") : "（一项都还没有）"
  }

树上现有的全部技能（key｜名字｜层｜领域｜白话），
前置只能从这些 key 里选，名字也不要和它们重复：
${catalogue}

请指出这棵树上缺的、而他给的方向真的需要的手艺。`;

  return generateRealityJson(NOMINATE_SYSTEM, contents, parseSkillNominations);
}

// ---------------------------------------------------------------------------
// 第四处 AI 调用：人物速写。
//
// 这一页有一堆清单 —— 属性、气质、技能、特性、形状 —— 但没有一句描述。
// 被人问"你是个什么样的人"，从清单里搬不出一句话来。
//
// 速写只有三句，规矩比别处都硬，因为它是唯一一处 AI 碰**证据**的地方：
//
//   1. 不许用形容词下结论。第一句必须是「在什么条件下，他会做什么」——
//      「他很谨慎」适用于一半的人，也无法被推翻；
//      「不确定的时候他会再等一周」能想象出画面，也能被反驳。
//   2. 每一句都必须引用一条**已经在库里的记录**，原样引，不许改写成更好听的。
//      引不到记录的句子直接丢 —— 那就是编的。
//   3. 第三句必须是"另一面"，但**不许为了凑而编**：
//      有记录到代价就写代价；只知道边界就写边界；
//      两样都没有，就明写着空缺 ——「还没有记录到它的另一面」。
//      空缺本身是信息：说明这一面还没被观察过，或者时间不够长。
//
// 最后这条是这一处的立身之本：不许出现一句既没有证据、
// 又不承认自己没有证据的话。规则不是"必须有代价"，是"不许假装完整"。
// ---------------------------------------------------------------------------

export const SKETCH_KINDS = ["behavior", "gain", "cost", "limit", "gap"] as const;
export type SketchKind = (typeof SKETCH_KINDS)[number];

export type SketchLine = {
  kind: SketchKind;
  text: string;
  /** 这句话靠的是哪一条记录。gap 之外必须非空。 */
  evidence: string;
};

const SKETCH_SYSTEM = `你在用三句话描述一个人。材料是他自己写下的记录。

三句，顺序固定：
1. kind=behavior —— **在什么条件下，他会做什么**。
   不许用形容词下结论。"他很谨慎"适用于一半的人，也无法被推翻；
   "不确定的时候他会再等一周"能想象出画面，也能被反驳。写后者。
2. kind=gain —— 这带来了什么。必须是记录里真的发生过的一件事。
3. 第三句是**另一面**，按材料里有什么选一种：
   - kind=cost：材料里确实记录到了它的代价。
   - kind=limit：写不出代价，但写得出边界 —— 它在什么条件下不成立。
   - kind=gap：两样都没有。这时候 text 就写"还没有记录到它的另一面"
     再加一句为什么（时间太短 / 这一面还没被记过），evidence 留空。
   注意：cost 和 limit 只有在材料里**真的有一条记录了坏结果的行**时才允许 ——
   「没做」「落空」「没被采纳」这类。材料里没有这种行就必须选 gap，
   不许根据常识推测一个听起来合理的代价。

铁律：
- 每一句都要给 evidence：**原样引用材料里的一条记录**，不许改写成更好听的说法。
  引不到就别写这一句 —— 引不到就是编的。kind=gap 是唯一允许 evidence 为空的。
- 禁止评价：不许出现"很强""优秀""有潜力""擅长""天赋"这类词。
- 禁止任何分数、百分比、性格类型名（INTP、i人 之类）。
- 三句话说的应该是**同一件事的三面**，不是三个不相干的优点。
  最好的速写是：他做得最好的那件事，和它带来的麻烦，是同一件事。
- 中文，每句不超过 60 字，口语。

输出 JSON：{"lines":[{"kind","text","evidence"}]}，正好三条。`;

const PRAISE = /很强|优秀|不错|有潜力|擅长|天赋|出色|卓越|INTP|[0-9]{1,3}\s*[%分]/;

/** 导出只为测试。 */
export function parseSketch(value: unknown): SketchLine[] {
  const root = value as { lines?: unknown };
  if (!Array.isArray(root?.lines) || root.lines.length !== 3) return [];

  const kinds = new Set<string>(SKETCH_KINDS);
  const lines = root.lines
    .map((item) => item as Record<string, unknown>)
    .map((item) => ({
      kind: String(item.kind ?? "").trim(),
      text: String(item.text ?? "").trim(),
      evidence: String(item.evidence ?? "").trim(),
    }))
    .filter((item) => kinds.has(item.kind) && item.text.length >= 6)
    .filter((item) => !PRAISE.test(item.text));

  if (lines.length !== 3) return [];
  if (lines[0].kind !== "behavior" || lines[1].kind !== "gain") return [];
  if (!["cost", "limit", "gap"].includes(lines[2].kind)) return [];

  // 除了明写空缺的那一种，每句都必须挂得上一条记录。
  // 一句既没有证据、又不承认自己没有证据的话，是这一处唯一不能出的错。
  for (const line of lines) {
    if (line.kind === "gap") continue;
    if (line.evidence.length < 4) return [];
  }
  return lines as SketchLine[];
}

export async function sketchPerson(input: {
  /** 已点亮节点的证据：技能名 + 他写的那句 proof。 */
  proofs: string[];
  /** 触发窗口：情境 + 做没做。 */
  windows: string[];
  /** 已对账的预测。 */
  forecasts: string[];
  /** 事迹。 */
  deeds: string[];
  /** 自述（已截断）。 */
  context: string;
}): Promise<SketchLine[]> {
  const section = (title: string, rows: string[]) =>
    rows.length > 0 ? `${title}：\n${rows.map((r) => `- ${r}`).join("\n")}` : "";

  const contents = [
    section("他点亮的技能，以及他写的证据", input.proofs),
    section("触发窗口（含符合条件但没做的）", input.windows),
    section("已对账的预测", input.forecasts),
    section("事迹", input.deeds),
    input.context ? `他写下的处境：${input.context}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  if (!contents.trim()) return [];
  const lines = await generateRealityJson(
    SKETCH_SYSTEM,
    `${contents}\n\n请写三句。`,
    parseSketch
  );
  return groundSketch(lines, contents, negatives(input));
}

/**
 * 材料里「记录到了不好的一面」的那些行。
 *
 * 第三句要写代价或边界，就必须踩在这类记录上。
 * 光要求 evidence 非空挡不住编造 —— 模型可以随手引一句无关的原文，
 * 然后在 text 里写一个听着合理、但库里根本没发生过的代价。
 * 这一层挡的就是这个：**没有负面记录，就不许出现代价**。
 */
function negatives(input: {
  windows: string[];
  forecasts: string[];
  deeds: string[];
}): string[] {
  return [
    ...input.windows.filter((row) => row.includes("没做")),
    ...input.forecasts.filter((row) => row.includes("落空")),
    ...input.deeds.filter((row) => row.includes("没被采纳")),
  ];
}

const NO_OTHER_SIDE = "还没有记录到它的另一面 —— 可能是没发生，也可能是还没记。";

/**
 * 落地检查，两条：
 *   · 每一句引的必须是材料里**逐字存在**的原文；
 *   · 第三句若声称代价或边界，它引的那条还必须真的是一条负面记录。
 * 任一不过，第三句降级成明写的空缺 —— 宁可承认没有，也不许假装完整。
 */
export function groundSketch(
  lines: SketchLine[],
  material: string,
  negativeRows: string[]
): SketchLine[] {
  if (lines.length !== 3) return [];
  for (const line of lines) {
    if (line.kind === "gap") continue;
    if (!material.includes(line.evidence)) return [];
  }

  const last = lines[2];
  if (last.kind === "gap") return lines;
  if (negativeRows.some((row) => row.includes(last.evidence))) return lines;
  return [
    lines[0],
    lines[1],
    { kind: "gap", text: NO_OTHER_SIDE, evidence: "" },
  ];
}
