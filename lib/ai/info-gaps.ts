import { executeAiJson } from "@/lib/ai-gateway";
import { MODEL } from "./shared";
import { assertChineseAllowingNames, assertNoBanned, mentionsNumericLikelihood } from "./signals";
import { ROUTE_KINDS, type RouteKind } from "@/lib/domains/ideas/info-gaps-shared";

// ---------------------------------------------------------------------------
// 想法的信息缺口：继续还是 Kill 还缺哪几样信息、看到什么就该放弃、去哪拿；以及这是不是他的机会。
// ---------------------------------------------------------------------------

export type InfoGapInput = {
  title: string;
  /** 假设的几格（已填的）。 */
  hypothesis: { label: string; text: string }[];
  exitCriteria: string[];
  validations: number;
  /** 他自己写的约束和优势（只有事实）；没写为空。 */
  founderFacts: string;
};

export type InfoGapDraft = {
  gaps: { question: string; matters: string; disconfirm: string; routes: { kind: RouteKind; how: string }[]; days: number }[];
  fit: { uses: { fact: string; how: string }[]; hits: { fact: string; how: string }[] } | null;
};

const MAX_GAPS = 5;

const INFO_GAP_PROMPT = `下面是他的一个想法（假设的几格、退出条件、已经记过几次真实接触），可能还有他自己写的约束和优势（只有事实）。你做两件事。

一、列 3 到 ${MAX_GAPS} 个信息缺口：要做"继续还是 Kill"这个决定，现在最缺、而且一旦拿到就可能让他改主意的信息。
对抗性地挑：先挑最可能让这个想法死的那几个（没人真的需要、没人愿意付钱、触达不到用户、不该由他来做、时机不对、单位经济算不过来）。
每个写：
- question：缺什么，一句，具体到哪群人、什么行为（例："在日华人家庭里，现在有没有人在花钱请人代办 X、花多少"）
- matters：拿到以后会怎样改变决定，一句（例："几乎没人在花钱，就该 Kill；有人在花、价格在 X 以上，就值得开假门"）
- disconfirm：看到什么就该放弃，一句，具体、能看得到（这是反证：专门去找会让他放弃的信息，不要只找支持的）
- routes：2 到 4 条去哪拿，按可信度从高到低排；kind 只能是：
  contact（找真人：聊、假门、投一点广告、在日华人的群、付费问卷、按小时约懂行的人）
  trace（已经有人在花钱、花时间的痕迹：ココナラ / クラウドワークス 上代办服务的成交数和价格、メルカリ 卖掉了多少、App 的评分人数和排名、求人、补助金、搜索量）
  voices（网上的原话：知恵袋、App 差评、吐槽）
  outside（外部视角：中国或美国同类的用户数和收费、以前来日本的同类结果怎样）
  how 写具体怎么拿：去哪、搜什么、问谁，一句
- days：几天内该拿到（3 到 30 的整数；越关键、越便宜拿到的越短）

二、给了他的约束和优势才写 fit（没给就写 null）：这个想法用上了他哪些优势（uses）、碰到了他哪些约束（hits）。
每条 fact 照抄他写的原话里的一句或一段（代码会逐字核对，对不上的丢掉），how 一句话说怎么用上 / 怎么碰到。没有就空数组。
不下"适不适合你""值不值得做"的结论，只摆出来。

铁律：不打分，不写可能性的数字或百分比；不写"很有潜力""值得关注"这类话；用中文写（日本的服务名可以照写）。

只输出 JSON：{"gaps":[{"question":"…","matters":"…","disconfirm":"…","routes":[{"kind":"contact","how":"…"}],"days":7}],"fit":{"uses":[{"fact":"…","how":"…"}],"hits":[{"fact":"…","how":"…"}]}}`;

function material(input: InfoGapInput): string {
  return [
    `想法：${input.title}`,
    ...input.hypothesis.map((h) => `${h.label}：${h.text}`),
    input.exitCriteria.length > 0 ? `退出条件：\n${input.exitCriteria.map((c) => `- ${c}`).join("\n")}` : "退出条件：（还没写）",
    `已经记过的真实接触：${input.validations} 次`,
    "",
    input.founderFacts.trim() ? `他自己写的约束和优势：\n${input.founderFacts.trim()}` : "他自己写的约束和优势：（没写）",
  ].join("\n");
}

/**
 * 缺口：四样都要写、去哪拿至少两条且种类认得、天数夹在 3–30；
 * fit：fact 必须逐字出现在他写的那段里（去掉空白比），对不上的丢掉；他没写约束优势就没有 fit。
 */
export function parseInfoGaps(value: unknown, input: InfoGapInput): InfoGapDraft {
  const v = (value ?? {}) as Record<string, unknown>;
  const str = (r: Record<string, unknown>, k: string) => (typeof r[k] === "string" ? (r[k] as string).trim() : "");
  const gaps = (Array.isArray(v.gaps) ? v.gaps : [])
    .filter((g): g is Record<string, unknown> => !!g && typeof g === "object")
    .map((g) => {
      const routes = (Array.isArray(g.routes) ? g.routes : [])
        .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
        .map((r) => ({ kind: (typeof r.kind === "string" && r.kind in ROUTE_KINDS ? r.kind : null) as RouteKind | null, how: str(r, "how") }))
        .filter((r): r is { kind: RouteKind; how: string } => !!r.kind && !!r.how)
        .slice(0, 4);
      const days = Math.round(Number(g.days));
      return {
        question: str(g, "question"),
        matters: str(g, "matters"),
        disconfirm: str(g, "disconfirm"),
        routes,
        days: Number.isFinite(days) ? Math.min(30, Math.max(3, days)) : 14,
      };
    })
    .filter((g) => g.question && g.matters && g.disconfirm && g.routes.length >= 2)
    .slice(0, MAX_GAPS);
  if (gaps.length < 2) throw new Error("缺口不够两个，或者有的缺了几样");
  const long = gaps.find((g) => g.question.length > 120 || g.matters.length > 160 || g.disconfirm.length > 160 || g.routes.some((r) => r.how.length > 160));
  if (long) throw new Error("有一句太长");

  let fit: InfoGapDraft["fit"] = null;
  const facts = input.founderFacts.trim();
  if (facts && v.fit && typeof v.fit === "object") {
    const squash = (t: string) => t.replace(/\s+/g, "");
    const pick = (raw: unknown) =>
      (Array.isArray(raw) ? raw : [])
        .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
        .map((r) => ({ fact: str(r, "fact"), how: str(r, "how").slice(0, 120) }))
        .filter((r) => r.fact && r.how && squash(r.fact).length >= 2 && squash(facts).includes(squash(r.fact)))
        .slice(0, 5);
    const f = v.fit as Record<string, unknown>;
    fit = { uses: pick(f.uses), hits: pick(f.hits) };
  }

  const texts = [...gaps.flatMap((g) => [g.question, g.matters, g.disconfirm, ...g.routes.map((r) => r.how)]), ...(fit ? [...fit.uses, ...fit.hits].map((x) => x.how) : [])];
  assertNoBanned(texts);
  assertChineseAllowingNames(texts);
  if (texts.some(mentionsNumericLikelihood)) throw new Error("写了可能性的数字");
  return { gaps, fit };
}

/** 继续还是 Kill 还缺哪几样信息；给了约束优势就一起看是不是他的机会。 */
export async function planInfoGaps(input: InfoGapInput): Promise<InfoGapDraft> {
  return executeAiJson(
    { operation: "idea_info_gaps", module: "unknown", outputMode: "json", timeoutMs: 40_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        material(input) +
        (attempt === 1 ? "\n\n上一次输出没通过校验：至少两个缺口，每个四样都写、去哪拿至少两条；fit 的 fact 照抄原话；不写可能性数字。" : ""),
      config: {
        systemInstruction: INFO_GAP_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 1024 },
        maxOutputTokens: 3000,
      },
    }),
    (value) => parseInfoGaps(value, input)
  );
}
