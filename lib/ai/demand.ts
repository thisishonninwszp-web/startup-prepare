import { executeAiJson, executeJev, type JevQuestion, type JevResult } from "@/lib/ai-gateway";
import { MODEL } from "./shared";
import { assertChineseAllowingNames, type SearchSource } from "./signals";
import { VOICE_KINDS, type VoiceKind } from "@/lib/domains/signals/voices-shared";
import { DOOR_LIMITS, type DoorLang, type FakeDoorDraft } from "@/lib/domains/signals/fake-door-shared";

// ---------------------------------------------------------------------------
// 需求方：这边有没有人在为这件事头疼（真人原话），以及假门测试那一页的文字。
// 差距清单只问过"这边有没有这个东西"（供给方）；这里问"这边的人有没有这个麻烦"。
// ---------------------------------------------------------------------------

export type VoicePlan = { pain: string; queries: string[]; appTerm: string };

const voicePlanPrompt = (there: string, here: string) => {
  const ja = here === "日本";
  return `下面是${there}已经有、${here}还没有（或没普及）的一样东西。想知道${here}的人有没有它要解决的那件麻烦 —— 不是问${here}有没有这个东西，是问${here}的人有没有为这件事头疼。

写：
- pain：它要解决的那件麻烦，从用的人那一边说，一句中文，具体（例："叫外卖要等一个多小时""一个人生病在家时没人帮忙买药"）。不写那边的产品名。
- queries：3 个搜索词，用${ja ? "日语" : "中文"}，找${here}的人自己说出这件麻烦的地方：问答网站上的提问（${ja ? "知恵袋、教えて!goo" : "知乎、小红书、豆瓣"}）、吐槽、"有没有人知道怎么办"。用普通人会说的话（${ja ? "「〇〇 困る」「〇〇 面倒」「〇〇 どうしてる」" : "「〇〇 好麻烦」「〇〇 怎么办」「〇〇 吐槽」"}），不用行业术语，不用那边的产品名。
- appTerm：${here}的人现在拿来对付这件事的 App 是哪一类，写一个 App Store 搜索词（${ja ? "日语" : "中文"}，2 到 4 个词）；跟 App 不沾边就写空字符串。

只输出 JSON：{"pain":"…","queries":["…","…","…"],"appTerm":"…"}`;
};

export function parseVoicePlan(value: unknown): VoicePlan {
  const v = (value ?? {}) as Record<string, unknown>;
  const pain = typeof v.pain === "string" ? v.pain.trim() : "";
  if (!pain || pain.length > 60) throw new Error("pain 没写或太长");
  assertChineseAllowingNames([pain]);
  const queries = (Array.isArray(v.queries) ? v.queries : [])
    .filter((q): q is string => typeof q === "string" && !!q.trim())
    .map((q) => q.trim().slice(0, 120))
    .slice(0, 3);
  if (queries.length < 2) throw new Error("搜索词太少");
  const appTerm = typeof v.appTerm === "string" ? v.appTerm.trim().slice(0, 40) : "";
  return { pain, queries, appTerm };
}

/** 它要解决的那件麻烦（从用的人那边说）、去哪搜真人原话、这边的人现在用哪类 App。 */
export async function planVoiceSearch(input: { headline: string; background: string; hereNow: string; there: string; here: string }): Promise<VoicePlan> {
  const contents = [`这样东西：${input.headline}`, `它在${input.there}：${input.background || "（没写）"}`, `${input.here}现在：${input.hereNow}`].join("\n");
  return executeAiJson(
    { operation: "gap_voice_plan", module: "unknown", outputMode: "json", timeoutMs: 15_000 },
    (attempt) => ({
      model: MODEL,
      contents: contents + (attempt === 1 ? "\n\n上一次输出没通过校验：pain 用中文、一句、60 字以内；queries 至少两个。" : ""),
      config: {
        systemInstruction: voicePlanPrompt(input.there, input.here),
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 500,
      },
    }),
    parseVoicePlan
  );
}

/** 一次最多收几句原话。 */
export const MAX_VOICES = 8;

export type RawVoice = { source: number; excerpt: string; kind: VoiceKind };

const VOICE_EXTRACT_PROMPT = `下面是上网找到的网页和 App Store 评论（带编号），还有要找的那件麻烦。
挑出**真人在说自己这件事**的原话，最多 ${MAX_VOICES} 句。

算：提问的人、写评论的人、写自己经历的人，说的就是这件麻烦（或者这件麻烦现在的解决办法不好用）。
不算：新闻报道、公司宣传、广告、比较网站的介绍、专家解说；说的是别的麻烦。

每句写：
- source：资料编号
- excerpt：逐字照抄原文（不翻译、不改字，10 到 120 字），要能看出他在说这件麻烦
- kind：${Object.entries(VOICE_KINDS)
  .map(([k, label]) => `${k}（${label}）`)
  .join(" / ")}
  workaround 指已经在花钱或花力气凑合：雇人、买别的东西将就、自己折腾。

宁缺毋滥，没有就给空数组。

只输出 JSON：{"quotes":[{"source":1,"excerpt":"…","kind":"complain"}]}`;

/** 原文逐字对得上（去掉空白比）、长度够、不重复的才留；类别认不出的丢掉。 */
export function parseVoiceQuotes(value: unknown, sources: SearchSource[]): RawVoice[] {
  const raw = (value as { quotes?: unknown } | null)?.quotes;
  if (!Array.isArray(raw)) throw new Error("缺少 quotes");
  const squash = (t: string) => t.replace(/\s+/g, "");
  const seen = new Set<string>();
  const out: RawVoice[] = [];
  for (const q of raw) {
    if (!q || typeof q !== "object") continue;
    const v = q as Record<string, unknown>;
    const source = typeof v.source === "number" ? v.source : Number(v.source);
    const src = sources[source - 1];
    const excerpt = typeof v.excerpt === "string" ? v.excerpt.trim().slice(0, 200) : "";
    const kind = typeof v.kind === "string" && v.kind in VOICE_KINDS ? (v.kind as VoiceKind) : null;
    if (!src || !kind || squash(excerpt).length < 8 || !squash(src.content).includes(squash(excerpt))) continue;
    if (seen.has(squash(excerpt))) continue;
    seen.add(squash(excerpt));
    out.push({ source, excerpt, kind });
    if (out.length >= MAX_VOICES) break;
  }
  return out;
}

/** 从网页和评论里挑真人原话（原文由代码核对）。 */
export async function extractVoices(pain: string, sources: SearchSource[]): Promise<RawVoice[]> {
  if (sources.length === 0) return [];
  const contents = [
    `要找的那件麻烦：${pain}`,
    "",
    sources.map((s, i) => `[资料 ${i + 1}] ${s.title}\n${s.content.slice(0, 1500)}`).join("\n\n"),
  ].join("\n");
  return executeAiJson(
    { operation: "gap_voice_extract", module: "unknown", outputMode: "json", timeoutMs: 40_000 },
    (attempt) => ({
      model: MODEL,
      contents: contents + (attempt === 1 ? "\n\n上一次输出没通过校验。excerpt 必须逐字照抄资料原文，source 是资料编号。" : ""),
      config: {
        systemInstruction: VOICE_EXTRACT_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 2000,
      },
    }),
    (value) => parseVoiceQuotes(value, sources)
  );
}

const VOICE_JUDGE_ABOVE = 0.5;
const VOICE_OPTIONS: (VoiceKind | null)[] = [null, "complain", "seek", "workaround"];

/** 每句：四个选项（不算 / 抱怨 / 找办法 / 绕路）里概率最高的那个，过了门槛才算；最高是"不算"或拿不准的为 null。 */
export function parseVoiceKinds(result: JevResult, count: number): (VoiceKind | null)[] {
  return Array.from({ length: count }, (_, i) => {
    const probs = (result.answers[`v_${i}`] as { probabilities?: Record<string, unknown> } | undefined)?.probabilities ?? {};
    const values = VOICE_OPTIONS.map((_, k) => {
      const p = probs[String(k)];
      return typeof p === "number" && Number.isFinite(p) ? p : 0;
    });
    const top = values.indexOf(Math.max(...values));
    return top > 0 && values[top] > VOICE_JUDGE_ABOVE ? VOICE_OPTIONS[top] : null;
  });
}

/**
 * 请 Jev 独立看每句原话：是不是真人在说这件麻烦、属于哪一种。原文逐字核对只保证"这句在网页上"，
 * 不保证说的是这件事（广告、新闻里也有"困る"）。裁判不可用返回错误，调用方照收 AI 分的类、标出来。
 */
export async function judgeVoices(
  pain: string,
  quotes: { excerpt: string; label: string }[]
): Promise<{ ok: true; kinds: (VoiceKind | null)[] } | { ok: false; error: string }> {
  if (quotes.length === 0) return { ok: true, kinds: [] };
  const criteria = [
    "不算：不是真人在说自己的事（新闻、广告、公司介绍），或者说的不是这件麻烦",
    `在抱怨这件麻烦`,
    `在问有没有办法、在找替代`,
    `已经在花钱或花力气绕路（雇人、买别的将就、自己折腾）`,
  ];
  const questions: Record<string, JevQuestion> = {};
  quotes.forEach((_, i) => {
    questions[`v_${i}`] = {
      type: "score",
      instructions: `[${i}] 这一句是哪一种？只看这句话本身写了什么，不替它补意思。`,
      criteria,
    };
  });
  const state = [`要找的麻烦：${pain}`, quotes.map((q, i) => `[${i}]（${q.label}）「${q.excerpt}」`).join("\n")].join("\n\n");
  try {
    const kinds = await executeJev({ operation: "gap_voice_judge", module: "unknown", timeoutMs: 30_000 }, { state, questions }, (result) =>
      parseVoiceKinds(result, quotes.length)
    );
    return { ok: true, kinds };
  } catch (e) {
    console.error("voice judge failed", e);
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 160) : "没调通" };
  }
}

// ── 假门测试：那一页的文字 ───────────────────────────────────────────────

const doorPrompt = (lang: DoorLang, there: string, here: string) => {
  const ja = lang === "ja";
  return `他想测一测：${here}有没有人愿意为下面这样东西付钱。做法是放一页"准备中的服务"，看陌生人愿不愿意留邮箱。你起草这一页的文字。

用${ja ? "日语" : "中文"}写，写给${here}的普通人看，说人话：
- title：一句说明它做什么的话（例："${ja ? "アプリで頼める、近所の家事代行" : "手机上就能约的上门家政"}"），不起品牌名，不用任何真实公司或产品的名字。${DOOR_LIMITS.title} 字以内。
- lead：一到两句，说它帮谁解决什么麻烦。${DOOR_LIMITS.lead} 字以内。
- points：3 条，用起来是什么样（具体的场景或步骤），每条 ${DOOR_LIMITS.point} 字以内。
- audience：最适合谁，一句，${DOOR_LIMITS.audience} 字以内。

铁律（写了就作废）：
- 不编任何事实：不写有多少人在用、合作公司、评价、获奖、"No.1"、上线日期。
- 不写夸张的话（"革命""最强""绝对"）。
- 不写价格（他自己填）。不提${there}那边的公司和产品名。
- "还没有这个服务、现在不收钱"那段说明由页面自己加，你不用写。

只输出 JSON：{"title":"…","lead":"…","points":["…","…","…"],"audience":"…"}`;
};

/** 编出来的事实、夸张的话、价格：写了就作废（"1万人が利用""No.1""満足度""革命的""¥980"）。 */
const DOOR_BANNED = [
  /No\.?\s?1|ナンバーワン|业界第一|行业第一/i,
  /実績|満足度|お客様の声|口コミ|受賞|获奖|好评/,
  /革命|最強|最强|絶対|绝对/,
  /\d[\d,]*\s*万?\s*(人|社|名|店|家|ユーザー|用户)\s*(が|以上|突破|在用|使用|选择|導入|利用)/,
  /(利用|導入|登録|使用)(者|社|店|用户)?(数|人数)/,
  /[¥￥]|\d\s*[円元]/,
];

export function parseFakeDoorDraft(value: unknown, lang: DoorLang): FakeDoorDraft {
  const v = (value ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof v[k] === "string" ? (v[k] as string).trim() : "");
  const title = str("title");
  const lead = str("lead");
  const audience = str("audience");
  const points = (Array.isArray(v.points) ? v.points : [])
    .filter((p): p is string => typeof p === "string" && !!p.trim())
    .map((p) => p.trim())
    .slice(0, 3);
  if (!title || !lead || !audience || points.length < 3) throw new Error("缺了几格");
  if (title.length > DOOR_LIMITS.title + 10 || lead.length > DOOR_LIMITS.lead + 40 || audience.length > DOOR_LIMITS.audience + 20)
    throw new Error("写得太长");
  if (points.some((p) => p.length > DOOR_LIMITS.point + 20)) throw new Error("有一条太长");
  const all = [title, lead, audience, ...points];
  const banned = DOOR_BANNED.find((re) => all.some((t) => re.test(t)));
  if (banned) throw new Error(`写了不该写的：${all.find((t) => banned.test(t))?.slice(0, 20)}`);
  if (lang === "ja") {
    // 日文页：句子里要有平假名（全是汉字的多半是写成了中文）
    const text = all.join("");
    if ((text.match(/[぀-ゟ]/g) ?? []).length < text.length * 0.1) throw new Error("没有用日语写");
  } else {
    assertChineseAllowingNames(all);
  }
  return { title, lead, points, audience };
}

/** 假门那一页的文字（价格和运营者由他自己填）。 */
export async function draftFakeDoor(input: {
  lang: DoorLang;
  headline: string;
  background: string;
  hereNow: string;
  there: string;
  here: string;
  pain: string | null;
}): Promise<FakeDoorDraft> {
  const contents = [
    `这样东西：${input.headline}`,
    `它在${input.there}：${input.background || "（没写）"}`,
    `${input.here}现在：${input.hereNow}`,
    input.pain ? `${input.here}的人在为这件麻烦头疼（网上找到过真人原话）：${input.pain}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return executeAiJson(
    { operation: "fake_door_draft", module: "unknown", outputMode: "json", timeoutMs: 20_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        contents +
        (attempt === 1 ? "\n\n上一次输出没通过校验：不写人数、评价、价格、夸张的话；四格都要写；照规定的语言和字数。" : ""),
      config: {
        systemInstruction: doorPrompt(input.lang, input.there, input.here),
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 800,
      },
    }),
    (value) => parseFakeDoorDraft(value, input.lang)
  );
}
