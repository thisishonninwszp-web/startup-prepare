import { generateRealityJson } from "./reality";
import type { Dossier, DossierLabel, Divide } from "@/lib/domains/self-model/dossier";

// ---------------------------------------------------------------------------
// 三份档案里唯一的 AI 调用：给已经算好的簇起名字。
//
// 分工是死的：**代码切证据、数条数、写推翻条件；AI 只起名字和写那句凭什么。**
// AI 拿到的每一簇都已经定好了在哪一侧、有几条证据，它改不了归属，
// 也不许自己提一条新的标签 —— 没有证据的簇不存在，也就没有名字可起。
//
// 为什么名字非得让 AI 来起：代码能把「自发项目·有人要」这种主题 key 算出来，
// 但那不是人话。一个人需要的是「做完了没人要」这样一句能被别人听懂的话。
// 这一步是翻译，不是判断。
//
// 硬约束（写进 prompt，解析器里再挡一次）：
//   1. 不许出现任何数字、比例、程度词 —— 数字全部由代码填，AI 写了就丢掉。
//   2. 不许夸、不许安慰、不许鼓励。欠着那一侧尤其不许找补。
//   3. 名字必须能从这簇证据里读出来，不许引入证据里没有的事。
//   4. 不许人格类型名（INTP、i人、内向者、完美主义者这类现成标签）。
// ---------------------------------------------------------------------------

export type NamedLabel = {
  subject: string;
  /** 二到八个字的标签名。 */
  name: string;
  /** 凭什么这么说 —— 一句，只能复述这簇证据里已有的事。 */
  because: string;
};

export type NamedDivide = {
  subject: string;
  /** 什么情况下你是前者，什么情况下是后者。 */
  condition: string;
};

/** AI 写了就丢：数字、程度词、评价词、现成人格标签。 */
const BANNED =
  /[0-9０-９]|很有|非常|特别|极其|优秀|不错|擅长|潜力|天赋|了不起|厉害|加油|别灰心|其实挺|完美主义|拖延症|INTP|INFJ|[ie]\s*人|内向者|外向者/i;

const SYSTEM = `你在给 IdeaOS 的「三份档案」里已经算好的证据簇起名字。

先说清楚你不做什么：
- 你**不判断**哪条证据算兑现、哪条算欠着 —— 这已经由代码定死了，你改不了。
- 你**不数数** —— 每簇有几条、要几条才能翻过来，全部由代码填，你写数字一律作废。
- 你**不新增** —— 证据里没有的事，一个字都不许写。

你只做一件事：把一簇具体的事，翻成一句人话的标签。

写法：
- name：二到八个字，动词句优先，要有画面。
  好：「有人盯着才动」「结果漂亮就不再查了」「开口之前先自己扛三天」
  坏：「执行力强」「缺乏推动力」「完美主义倾向」—— 这些是形容词，不是人话。
- because：一句，指向这簇里的具体那几次，像一个知情的老同事在旁边说。
  不许下结论，不许找补，不许安慰。

两侧的语气一样冷：
- 兑现那侧不许夸。「说到做到」就是「说到做到」，不加「很棒」。
- 欠着那侧不许找补。不许写「但这也说明你很有勇气」这类话。
  这一侧本来就该扎人 —— 它底下挂的是用户自己写下的真事，不是你的评价。

分水岭（divides）是同一件事上他两边都占过的地方，写 condition：
一句话说清**什么情况下他是前者、什么情况下是后者**，
两个情况都必须从证据的处境里读出来，不许猜。

输出 JSON：{"labels":[{"subject","name","because"}],"divides":[{"subject","condition"}]}
subject 必须原样抄回给你的那个，不许改写。给不出人话的簇就跳过，宁可少。

最后一条，很容易犯：**每个簇的 name 必须互不相同**。
兑现那侧和欠着那侧常常挨着（「都做完了」和「做完了没人要」是两回事），
给它们起同一个名字等于把两簇糊成一簇，那正是这套东西要避免的。`;

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || BANNED.test(text)) return null;
  return text;
}

/** 导出只为可测：AI 的输出必须在这里被挡一次，不能只靠 prompt。 */
export function parseDossierNames(subjects: Set<string>) {
  return (value: unknown): { labels: NamedLabel[]; divides: NamedDivide[] } => {
    const root = value as { labels?: unknown; divides?: unknown };

    const labels = (Array.isArray(root?.labels) ? root.labels : [])
      .map((item) => item as Record<string, unknown>)
      .map((item) => ({
        subject: typeof item.subject === "string" ? item.subject : "",
        name: clean(item.name),
        because: clean(item.because),
      }))
      .filter(
        (item): item is NamedLabel =>
          subjects.has(item.subject) &&
          item.name !== null &&
          item.because !== null
      )
      // 重名的只留第一条。两簇共用一个名字等于把它们糊成一簇，
      // 而「都做完了」和「做完了没人要」恰恰是必须分开的两件事。
      .filter((item, index, all) => {
        const seen = all.findIndex((other) => other.name === item.name);
        return seen === index;
      });

    const divides = (Array.isArray(root?.divides) ? root.divides : [])
      .map((item) => item as Record<string, unknown>)
      .map((item) => ({
        subject: typeof item.subject === "string" ? item.subject : "",
        condition: clean(item.condition),
      }))
      .filter(
        (item): item is NamedDivide =>
          subjects.has(item.subject) && item.condition !== null
      );

    return { labels, divides };
  };
}

function describeLabel(label: DossierLabel): string {
  const side = label.side === "kept" ? "兑现" : "欠着";
  const lines = label.evidence
    .slice(0, 6)
    .map((item) => `    · ${item.occurredOn} ${item.claim}${item.context ? `（当时：${item.context}）` : ""}`)
    .join("\n");
  return `- subject: ${label.subject}\n  这一侧：${side}\n  证据：\n${lines}`;
}

function describeDivide(divide: Divide): string {
  const kept = divide.kept
    .slice(0, 4)
    .map((item) => `    · ${item.claim}${item.context ? `（${item.context}）` : ""}`)
    .join("\n");
  const unkept = divide.unkept
    .slice(0, 4)
    .map((item) => `    · ${item.claim}${item.context ? `（${item.context}）` : ""}`)
    .join("\n");
  return `- subject: ${divide.subject}\n  做到的时候：\n${kept}\n  没做到的时候：\n${unkept}`;
}

/**
 * 给档案里的簇起名字。
 *
 * 只处理够条数的簇（strength === "label"）—— 苗头不起名字，
 * 因为一个听着很准的名字会让两条证据显得像一个结论。
 */
export async function nameDossier(dossier: Dossier): Promise<{
  labels: NamedLabel[];
  divides: NamedDivide[];
}> {
  const named = [...dossier.kept, ...dossier.unkept].filter(
    (label) => label.strength === "label"
  );

  if (named.length === 0 && dossier.divides.length === 0) {
    return { labels: [], divides: [] };
  }

  const subjects = new Set<string>([
    ...named.map((label) => label.subject),
    ...dossier.divides.map((divide) => divide.subject),
  ]);

  const contents = [
    "兑现与欠着的簇：",
    named.map(describeLabel).join("\n"),
    "",
    "两边都占过的（分水岭）：",
    dossier.divides.length > 0
      ? dossier.divides.map(describeDivide).join("\n")
      : "（没有）",
  ].join("\n");

  return generateRealityJson(SYSTEM, contents, parseDossierNames(subjects));
}

/** 把 AI 起好的名字贴回档案。代码算的那些字段一个都不动。 */
export function applyNames(
  dossier: Dossier,
  named: { labels: NamedLabel[]; divides: NamedDivide[] }
): Dossier {
  const bySubject = new Map(named.labels.map((item) => [item.subject, item]));
  const divideBySubject = new Map(
    named.divides.map((item) => [item.subject, item])
  );

  const attach = (label: DossierLabel): DossierLabel => ({
    ...label,
    name: bySubject.get(label.subject)?.name ?? null,
    because: bySubject.get(label.subject)?.because ?? null,
  });

  return {
    ...dossier,
    kept: dossier.kept.map(attach),
    unkept: dossier.unkept.map(attach),
    divides: dossier.divides.map((divide) => ({
      ...divide,
      condition: divideBySubject.get(divide.subject)?.condition ?? null,
    })),
  };
}
