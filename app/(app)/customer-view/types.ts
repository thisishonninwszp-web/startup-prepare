export const CUSTOMER_MARKETS = ["cn", "jp", "en"] as const;
export type CustomerMarket = (typeof CUSTOMER_MARKETS)[number];

/**
 * 搜公开材料时先去人们讲自己经历的地方找。2026-11 小样本：直接搜，30 页里只有 3 页有顾客本人的话，
 * 其余是商家、中介的页面；日文只搜知恵袋、ガルちゃん，16 页里 11 页有；中文只搜豆瓣、V2EX，16 页里 3 页有（直接搜是 0）。
 * 只放 robots.txt 允许程序读帖子页的网站：知乎、小红书、Quora、Reddit、百度知道、微博、虎扑不许，不放。
 * 中文后来加上百度贴吧（robots 只限了点名的几个爬虫）、什么值得买的帖子、黑猫投诉（没有 robots.txt）：
 * 四个假设各 8 页，有顾客原话的页数差不多（贴吧 17/32、值得买 16/32、豆瓣+V2EX 16/32），黑猫投诉 27/32 但全是投诉。
 * 英文没有这样的网站，改成在搜索词后面加上「讲经历」的说法（7 页里 0 页 → 3 页）。
 * 「有顾客原话」不等于对题：后来一页页读标题，大半讲的是别的事，所以另有 mentionsTopic 按核心词筛。
 */
export const CUSTOMER_VOICE_SITES: Record<CustomerMarket, readonly string[]> = {
  jp: ["detail.chiebukuro.yahoo.co.jp", "girlschannel.net"],
  cn: [
    "douban.com",
    "v2ex.com",
    "tieba.baidu.com",
    "post.smzdm.com",
    "tousu.sina.com.cn",
  ],
  en: [],
};
const CUSTOMER_VOICE_WORDS: Record<CustomerMarket, string> = {
  jp: "",
  cn: "",
  en: "my experience forum",
};
/** 讲经历的地方找到的不满这么多页，再按原来的搜索词补上。 */
export const MIN_VOICE_RESULTS = 3;

export function customerVoiceSearch(
  market: CustomerMarket,
  query: string
): { query: string; domains?: string[] } {
  const domains = CUSTOMER_VOICE_SITES[market];
  const words = CUSTOMER_VOICE_WORDS[market];
  return {
    query: words ? `${query} ${words}` : query,
    ...(domains.length ? { domains: [...domains] } : {}),
  };
}

/** 每个市场的搜索词用哪种语言写。 */
export const CUSTOMER_MARKET_LANGS: Record<CustomerMarket, "ja" | "zh" | "en"> = {
  jp: "ja",
  cn: "zh",
  en: "en",
};

/**
 * 每个市场：这件事的核心词（普通人搜索一定会打的那个词）和几个普通人的搜索词。
 * 以前是把顾客假设整句翻译过去搜，句子太书面，搜索引擎抓住别的词就跑偏（「通勤」「受け取り」）。
 */
export type CustomerSearchPlan = Partial<
  Record<CustomerMarket, { topic: string; queries: string[] }>
>;

const normalizeForTopic = (text: string) =>
  text.normalize("NFKC").toLowerCase().replace(/\s+/g, "");

/** 标题或开头里有没有核心词（几个词的话每个都要有）。不打分，只是对不对得上。 */
export function mentionsTopic(topic: string, ...texts: string[]): boolean {
  const parts = topic.split(/\s+/).map(normalizeForTopic).filter(Boolean);
  if (!parts.length) return false;
  const haystack = normalizeForTopic(texts.join(" "));
  return parts.every((part) => haystack.includes(part));
}

/** 读 AI 写的搜索计划：核心词 1–20 字；搜索词 2–3 个，没带核心词的由代码补上。哪个市场写坏了就当没写。 */
export function parseCustomerSearchPlan(
  value: unknown,
  markets: readonly CustomerMarket[]
): CustomerSearchPlan {
  const input = (value && typeof value === "object" ? value : {}) as Record<
    string,
    unknown
  >;
  const plan: CustomerSearchPlan = {};
  for (const market of markets) {
    const raw = input[CUSTOMER_MARKET_LANGS[market]];
    if (!raw || typeof raw !== "object") continue;
    const { topic: rawTopic, queries: rawQueries } = raw as Record<string, unknown>;
    const topic =
      typeof rawTopic === "string"
        ? rawTopic.replace(/[「」『』"“”]/g, "").trim()
        : "";
    if (!topic || topic.length > 20) continue;
    const queries = (Array.isArray(rawQueries) ? rawQueries : [])
      .filter((query): query is string => typeof query === "string")
      .map((query) => query.replace(/[「」『』"“”]/g, "").trim().slice(0, 80))
      .filter(Boolean)
      .map((query) => (mentionsTopic(topic, query) ? query : `${topic} ${query}`))
      .slice(0, 3);
    if (queries.length < 2) continue;
    plan[market] = { topic, queries };
  }
  if (Object.keys(plan).length === 0) throw new Error("搜索计划没有一个市场写对");
  return plan;
}

export const CUSTOMER_MATERIAL_ORIGINS = [
  "web",
  "interview",
  "chat",
  "review",
  "url",
] as const;
export type CustomerMaterialOrigin =
  (typeof CUSTOMER_MATERIAL_ORIGINS)[number];

export const CUSTOMER_REVIEW_STATUSES = [
  "candidate",
  "kept",
  "excluded",
] as const;
export type CustomerReviewStatus =
  (typeof CUSTOMER_REVIEW_STATUSES)[number];

export const EMOTION_BASES = ["stated", "inferred", "unknown"] as const;
export type EmotionBasis = (typeof EMOTION_BASES)[number];

export const CUSTOMER_CADENCES = ["daily", "weekly"] as const;
export type CustomerCadence = (typeof CUSTOMER_CADENCES)[number];

export type CustomerEvidenceAtom = {
  id?: string;
  material_id: string;
  quote: string;
  scene: string;
  behavior: string;
  alternative: string;
  tradeoff: string;
  emotion: string;
  emotion_basis: EmotionBasis;
};

/**
 * 这句话是谁说的。customer：用的人讲自己的经历；seller：商家、服务方的介绍和广告
 * （包括商家页面上挑出来的「顾客评价」）；other：编辑、记者、专家的概括或转述。
 */
export const EVIDENCE_SPEAKERS = ["customer", "seller", "other"] as const;
export type EvidenceSpeaker = (typeof EVIDENCE_SPEAKERS)[number];

/**
 * 整页是什么。seller：商家、服务方自己的网站或宣传页 —— 页面上的「お客様の声」「顾客评价」
 * 是商家挑出来的，读正文时小标题已经被去掉，单看一句分不出来，所以按整页判、整页不收。
 * community：问答、论坛、评论区、个人讲自己经历的帖子或访谈记录；media：新闻、杂志、比较排行网站。
 */
export const EVIDENCE_PAGE_KINDS = ["seller", "community", "media", "other"] as const;
export type EvidencePageKind = (typeof EVIDENCE_PAGE_KINDS)[number];

export type CustomerEvidenceBatch = {
  pages?: { material_id: string; kind: EvidencePageKind }[];
  atoms: (CustomerEvidenceAtom & { speaker?: EvidenceSpeaker })[];
};

export type CustomerSegment = {
  key: string;
  label: string;
  situation: string;
  behaviors: string[];
  evidence_ids: string[];
  unknowns: string[];
};

export type CustomerSegments = { segments: CustomerSegment[] };

export type CustomerDayMoment = {
  time: string;
  scene: string;
  action: string;
  inner_voice: string;
  emotion: string;
  emotion_basis: EmotionBasis;
  tradeoff: string;
  evidence_ids: string[];
};

export type CustomerBarrierMap = {
  time: string[];
  money: string[];
  learning: string[];
  trust: string[];
  identity: string[];
  risk: string[];
};

export type CustomerProxy = {
  segment_key: string;
  who: string;
  is_provisional: boolean;
  day: CustomerDayMoment[];
  current_alternatives: string[];
  desired_progress: string[];
  switching_barriers: CustomerBarrierMap;
  own_words: { quote: string; evidence_id: string }[];
  unknowns: string[];
};

export type CustomerProxyAnswer = {
  answer: string;
  evidence_ids: string[];
  inference: string;
  unknowns: string[];
};

export type CustomerIdeaReaction = {
  first_reaction: string;
  reasons_to_refuse: string[];
  old_solution_inertia: string[];
  trust_gaps: string[];
  payment_barriers: string[];
  evidence_ids: string[];
  inference: string;
  unknowns: string[];
};

export type CustomerProxyDelta = {
  supported: string[];
  overturned: string[];
  new_unknowns: string[];
  changed_context: string[];
  reason: string;
};

export type CustomerPattern = {
  label: string;
  situation: string;
  behaviors: string[];
  barriers: string[];
  evidence_ids: string[];
  counterexamples: string[];
};

export type CustomerPatternReport = {
  patterns: CustomerPattern[];
  unknowns: string[];
};

export type CustomerOpportunity = {
  customer_progress: string;
  current_alternative: string;
  direction: string;
  evidence_ids: string[];
  evidence_gaps: string[];
  fatal_assumption: string;
};

export type CustomerOpportunities = {
  opportunities: CustomerOpportunity[];
};

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}必须是对象`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, label: string, allowEmpty = false): string {
  // 可以空着的格子，AI 有时写 null 或干脆不写，当空着处理，别让整份材料提取失败。
  if (allowEmpty && (value === null || value === undefined)) return "";
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
    throw new Error(`${label}必须是非空文本`);
  }
  return value.trim();
}

function asStrings(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label}必须是数组`);
  return value.map((item, index) => asString(item, `${label}[${index}]`));
}

function asEmotionBasis(value: unknown, label: string): EmotionBasis {
  if (value !== "stated" && value !== "inferred" && value !== "unknown") {
    throw new Error(`${label}.emotion_basis无效`);
  }
  return value;
}

function asIds(value: unknown, label: string): string[] {
  return Array.from(new Set(asStrings(value, label)));
}

export function parseCustomerEvidenceBatch(
  value: unknown
): CustomerEvidenceBatch {
  const input = asObject(value, "证据批次");
  if (!Array.isArray(input.atoms)) throw new Error("atoms必须是数组");
  // pages 可以没有（还没改提示词的语言版本）；写得不对的那一条当没写。
  const pages = Array.isArray(input.pages)
    ? input.pages.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const { material_id, kind } = item as Record<string, unknown>;
        return typeof material_id === "string" &&
          (EVIDENCE_PAGE_KINDS as readonly unknown[]).includes(kind)
          ? [{ material_id, kind: kind as EvidencePageKind }]
          : [];
      })
    : undefined;
  return {
    ...(pages ? { pages } : {}),
    atoms: input.atoms.map((item, index) => {
      const row = asObject(item, `atoms[${index}]`);
      return {
        material_id: asString(row.material_id, `atoms[${index}].material_id`),
        quote: asString(row.quote, `atoms[${index}].quote`),
        scene: asString(row.scene, `atoms[${index}].scene`, true),
        behavior: asString(row.behavior, `atoms[${index}].behavior`, true),
        alternative: asString(
          row.alternative,
          `atoms[${index}].alternative`,
          true
        ),
        tradeoff: asString(row.tradeoff, `atoms[${index}].tradeoff`, true),
        emotion: asString(row.emotion, `atoms[${index}].emotion`, true),
        emotion_basis: asEmotionBasis(
          row.emotion_basis,
          `atoms[${index}]`
        ),
        speaker: (EVIDENCE_SPEAKERS as readonly unknown[]).includes(row.speaker)
          ? (row.speaker as EvidenceSpeaker)
          : undefined,
      };
    }),
  };
}

const squashQuote = (text: string) => text.normalize("NFKC").replace(/\s+/g, "");

/** 原话是不是真在材料里：去掉空白、统一全半角后逐字比。4 个字以下的不算。 */
export function quoteInMaterial(quote: string, text: string): boolean {
  const squashed = squashQuote(quote);
  return squashed.length >= 4 && squashQuote(text).includes(squashed);
}

/**
 * 只留顾客自己说的、在材料里逐字找得到的原话。
 * 整页是商家自己的页面的，一条都不留（那上面的顾客评价是商家挑的）；
 * AI 标成商家或旁人说的丢掉；没标页面、没标是谁说的照留（还没改提示词的语言版本不会全军覆没），
 * 但原话照样要逐字核对。
 */
export function keepCustomerWords(
  batch: CustomerEvidenceBatch,
  textByMaterial: ReadonlyMap<string, string>
): CustomerEvidenceAtom[] {
  const sellerPages = new Set(
    (batch.pages ?? [])
      .filter((page) => page.kind === "seller")
      .map((page) => page.material_id)
  );
  return batch.atoms.flatMap(({ speaker, ...atom }) => {
    if (sellerPages.has(atom.material_id)) return [];
    if (speaker && speaker !== "customer") return [];
    const text = textByMaterial.get(atom.material_id);
    if (text === undefined || !quoteInMaterial(atom.quote, text)) return [];
    return [atom];
  });
}

export function parseCustomerSegments(value: unknown): CustomerSegments {
  const input = asObject(value, "顾客类型");
  if (!Array.isArray(input.segments)) throw new Error("segments必须是数组");
  if (input.segments.length < 2 || input.segments.length > 3) {
    throw new Error("segments必须包含2到3类顾客声音");
  }
  return {
    segments: input.segments.map((item, index) => {
      const row = asObject(item, `segments[${index}]`);
      return {
        key: asString(row.key, `segments[${index}].key`),
        label: asString(row.label, `segments[${index}].label`),
        situation: asString(row.situation, `segments[${index}].situation`),
        behaviors: asStrings(row.behaviors, `segments[${index}].behaviors`),
        evidence_ids: asIds(
          row.evidence_ids,
          `segments[${index}].evidence_ids`
        ),
        unknowns: asStrings(row.unknowns, `segments[${index}].unknowns`),
      };
    }),
  };
}

function parseBarrierMap(value: unknown): CustomerBarrierMap {
  const row = asObject(value, "switching_barriers");
  return {
    time: asStrings(row.time, "switching_barriers.time"),
    money: asStrings(row.money, "switching_barriers.money"),
    learning: asStrings(row.learning, "switching_barriers.learning"),
    trust: asStrings(row.trust, "switching_barriers.trust"),
    identity: asStrings(row.identity, "switching_barriers.identity"),
    risk: asStrings(row.risk, "switching_barriers.risk"),
  };
}

export function parseCustomerProxy(value: unknown): CustomerProxy {
  const input = asObject(value, "顾客代理");
  if (!Array.isArray(input.day)) throw new Error("day必须是数组");
  if (!Array.isArray(input.own_words)) throw new Error("own_words必须是数组");
  if (typeof input.is_provisional !== "boolean") {
    throw new Error("is_provisional必须是布尔值");
  }
  return {
    segment_key: asString(input.segment_key, "segment_key"),
    who: asString(input.who, "who"),
    is_provisional: input.is_provisional,
    day: input.day.map((item, index) => {
      const row = asObject(item, `day[${index}]`);
      return {
        time: asString(row.time, `day[${index}].time`),
        scene: asString(row.scene, `day[${index}].scene`),
        action: asString(row.action, `day[${index}].action`),
        inner_voice: asString(
          row.inner_voice,
          `day[${index}].inner_voice`
        ),
        emotion: asString(row.emotion, `day[${index}].emotion`, true),
        emotion_basis: asEmotionBasis(row.emotion_basis, `day[${index}]`),
        tradeoff: asString(row.tradeoff, `day[${index}].tradeoff`, true),
        evidence_ids: asIds(
          row.evidence_ids,
          `day[${index}].evidence_ids`
        ),
      };
    }),
    current_alternatives: asStrings(
      input.current_alternatives,
      "current_alternatives"
    ),
    desired_progress: asStrings(input.desired_progress, "desired_progress"),
    switching_barriers: parseBarrierMap(input.switching_barriers),
    own_words: input.own_words.map((item, index) => {
      const row = asObject(item, `own_words[${index}]`);
      return {
        quote: asString(row.quote, `own_words[${index}].quote`),
        evidence_id: asString(
          row.evidence_id,
          `own_words[${index}].evidence_id`
        ),
      };
    }),
    unknowns: asStrings(input.unknowns, "unknowns"),
  };
}

export function parseCustomerProxyAnswer(
  value: unknown
): CustomerProxyAnswer {
  const input = asObject(value, "顾客代理回答");
  return {
    answer: asString(input.answer, "answer"),
    evidence_ids: asIds(input.evidence_ids, "evidence_ids"),
    inference: asString(input.inference, "inference", true),
    unknowns: asStrings(input.unknowns, "unknowns"),
  };
}

export function parseCustomerIdeaReaction(
  value: unknown
): CustomerIdeaReaction {
  const input = asObject(value, "想法反应");
  return {
    first_reaction: asString(input.first_reaction, "first_reaction"),
    reasons_to_refuse: asStrings(input.reasons_to_refuse, "reasons_to_refuse"),
    old_solution_inertia: asStrings(
      input.old_solution_inertia,
      "old_solution_inertia"
    ),
    trust_gaps: asStrings(input.trust_gaps, "trust_gaps"),
    payment_barriers: asStrings(input.payment_barriers, "payment_barriers"),
    evidence_ids: asIds(input.evidence_ids, "evidence_ids"),
    inference: asString(input.inference, "inference", true),
    unknowns: asStrings(input.unknowns, "unknowns"),
  };
}

export function parseCustomerProxyDelta(
  value: unknown
): CustomerProxyDelta {
  const input = asObject(value, "代理差异");
  return {
    supported: asStrings(input.supported, "supported"),
    overturned: asStrings(input.overturned, "overturned"),
    new_unknowns: asStrings(input.new_unknowns, "new_unknowns"),
    changed_context: asStrings(input.changed_context, "changed_context"),
    reason: asString(input.reason, "reason", true),
  };
}

export function parseCustomerPatternReport(
  value: unknown
): CustomerPatternReport {
  const input = asObject(value, "模式报告");
  if (!Array.isArray(input.patterns)) throw new Error("patterns必须是数组");
  return {
    patterns: input.patterns.map((item, index) => {
      const row = asObject(item, `patterns[${index}]`);
      return {
        label: asString(row.label, `patterns[${index}].label`),
        situation: asString(row.situation, `patterns[${index}].situation`),
        behaviors: asStrings(row.behaviors, `patterns[${index}].behaviors`),
        barriers: asStrings(row.barriers, `patterns[${index}].barriers`),
        evidence_ids: asIds(
          row.evidence_ids,
          `patterns[${index}].evidence_ids`
        ),
        counterexamples: asStrings(
          row.counterexamples,
          `patterns[${index}].counterexamples`
        ),
      };
    }),
    unknowns: asStrings(input.unknowns, "unknowns"),
  };
}

export function parseCustomerOpportunities(
  value: unknown
): CustomerOpportunities {
  const input = asObject(value, "候选机会");
  if (!Array.isArray(input.opportunities)) {
    throw new Error("opportunities必须是数组");
  }
  if (input.opportunities.length > 3) throw new Error("候选机会最多3条");
  return {
    opportunities: input.opportunities.map((item, index) => {
      const row = asObject(item, `opportunities[${index}]`);
      return {
        customer_progress: asString(
          row.customer_progress,
          `opportunities[${index}].customer_progress`
        ),
        current_alternative: asString(
          row.current_alternative,
          `opportunities[${index}].current_alternative`
        ),
        direction: asString(
          row.direction,
          `opportunities[${index}].direction`
        ),
        evidence_ids: asIds(
          row.evidence_ids,
          `opportunities[${index}].evidence_ids`
        ),
        evidence_gaps: asStrings(
          row.evidence_gaps,
          `opportunities[${index}].evidence_gaps`
        ),
        fatal_assumption: asString(
          row.fatal_assumption,
          `opportunities[${index}].fatal_assumption`
        ),
      };
    }),
  };
}

export function validateCustomerCitations(
  citationIds: string[],
  allowedIds: string[]
): void {
  const allowed = new Set(allowedIds);
  const invalid = citationIds.find((id) => !allowed.has(id));
  if (invalid) throw new Error(`引用了未被允许的证据：${invalid}`);
}

export function collectProxyCitationIds(proxy: CustomerProxy): string[] {
  return Array.from(
    new Set([
      ...proxy.day.flatMap((moment) => moment.evidence_ids),
      ...proxy.own_words.map((word) => word.evidence_id),
    ])
  );
}

export function isProvisionalProxy(materialIds: string[]): boolean {
  return new Set(materialIds).size < 3;
}

export function filterEvidenceForSegment(
  atoms: CustomerEvidenceAtom[],
  segment: CustomerSegment
): CustomerEvidenceAtom[] {
  const allowed = new Set(segment.evidence_ids);
  return atoms.filter((atom) => atom.id && allowed.has(atom.id));
}

export function nextCustomerRun(
  cadence: CustomerCadence,
  from = new Date()
): Date {
  const next = new Date(from);
  next.setUTCDate(next.getUTCDate() + (cadence === "daily" ? 1 : 7));
  return next;
}
