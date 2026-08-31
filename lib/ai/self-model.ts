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
