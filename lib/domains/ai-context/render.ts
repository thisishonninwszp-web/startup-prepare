/**
 * 把 IdeaOS 里的记录写成给外面的 AI（Codex、Claude Code……）读的 Markdown。
 * 纯函数，不碰数据库：导出成文件夹（做法一）和 MCP 接口（做法二）共用这一套写法。
 *
 * 只读：外面的 AI 只能看，不能往回写 —— 材料箱是唯一的输入口（宪法）。
 * 材料用脱敏后的正文（sanitized_text），不送原文。
 */

export type ContextValidation = { has_pain: string; will_pay: string; note: string | null; contacted_at: string };
export type ContextPrediction = { text: string; due_at: string; outcome: string; note: string | null };
export type ContextDecision = { verdict: string; reason: string | null; learned: string | null; decided_at: string };
export type ContextExit = { criterion: string; triggered: string };

export type ContextIdea = {
  id: string;
  title: string | null;
  status: string;
  tags: string[];
  hypothesis: Record<string, unknown>;
  created_at: string;
  last_activity_at: string;
  validations: ContextValidation[];
  predictions: ContextPrediction[];
  decisions: ContextDecision[];
  exits: ContextExit[];
};

export type ContextObservation = { id: string; raw_text: string; tags: string[]; created_at: string };
export type ContextMaterial = { id: string; title: string | null; source_type: string; text: string; created_at: string };
export type ContextJudgment = {
  id: string;
  news_title: string;
  question: string;
  judgment: string;
  created_at: string;
  due_at: string | null;
  outcome: string | null;
  miss_reason: string | null;
  tags: string[];
};
export type ContextQuestion = {
  id: string;
  question: string;
  created_at: string;
  views: { view: string; reason: string | null; created_at: string }[];
};

export type ContextData = {
  exported_at: string;
  ideas: ContextIdea[];
  observations: ContextObservation[];
  materials: ContextMaterial[];
  judgments: ContextJudgment[];
  questions: ContextQuestion[];
};

/** 想法假设的六格（和 app/(app)/ideas/types.ts 的 HYPOTHESIS_FIELDS 同序；lib 不反向依赖 app）。 */
const HYPOTHESIS_LABELS: [string, string][] = [
  ["target_user", "目标用户"],
  ["pain", "具体痛点"],
  ["alternative", "替代方案"],
  ["why_insufficient", "为何不够好"],
  ["solution", "你的方案"],
  ["willingness_to_pay", "愿意付（金额/时间）"],
];

const SIGNAL_LABEL: Record<string, string> = { yes: "是", no: "否", unsure: "不确定" };
const OUTCOME_LABEL: Record<string, string> = { pending: "还没到期", hit: "说中了", miss: "没说中" };
const MISS_LABEL: Record<string, string> = {
  info: "信息不够",
  reasoning: "推理断了",
  timing: "时间估错",
  emotion: "被情绪带了",
  luck: "纯属意外",
};

/** 给外面的 AI 的规矩。放在文件夹的 README 和 MCP 每次回答的开头。 */
export const READER_RULES = `# 读这些记录之前

这是一个人为了真正创业而记下的东西：想法、去问真人得到的验证记录、平时的观察、读新闻时写下的判断。
你只能读，不能改，也不要假装你改了。

1. 你的任务是帮用户找出想法会死的理由、证据哪里不够，不是让用户感觉良好。不许夸，不许说"很有潜力""不错的想法"。
2. 不打分。不给 1-10 分、星级、百分比。只能说"证据够 / 不够"，以及缺的是哪一条。
3. 分清楚两种东西：
   - 用户亲眼看到、亲耳听到的：验证记录（"有真实痛吗""愿付钱吗"是用户问过真人后记的是 / 否 / 不确定）、观察、材料。
   - 用户自己的推测：想法里的假设六格、读新闻写的判断。
   假设写得再完整，也不等于被验证过。
4. 说一件事就指出是哪个文件、哪一条、哪天的。找不到出处的话不要说。
5. 要不要继续、Go 还是 Kill，由用户决定。你可以说证据指向哪边，不替用户拍板。
6. 一个想法停在"验证中"超过 3 天、没有新的验证记录，就直说：先别分析了，去找一个真人聊一次。
7. 材料是脱敏版，被遮掉的人名、公司名不要去猜。`;

function day(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "—";
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** 文件名用：去掉 Windows 不认的字符，截短。 */
export function slugify(text: string | null, fallback: string): string {
  const s = (text ?? "")
    .replace(/[\\/:*?"<>|#\r\n\t]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return s || fallback;
}

export function renderIdea(idea: ContextIdea): string {
  const lines = [
    `# ${idea.title?.trim() || "（没起标题的想法）"}`,
    "",
    `- 编号：${idea.id}`,
    `- 状态：${idea.status}`,
    `- 记下：${day(idea.created_at)}，最近一次动它：${day(idea.last_activity_at)}`,
    idea.tags.length ? `- 标签：${idea.tags.join("、")}` : "",
    "",
    "## 假设（用户自己的推测，没验证过的不算数）",
    "",
  ];
  for (const [key, label] of HYPOTHESIS_LABELS) {
    const v = str(idea.hypothesis[key]);
    lines.push(`- ${label}：${v || "（空着）"}`);
  }
  lines.push("", `## 验证记录（去问真人后记的，一共 ${idea.validations.length} 次）`, "");
  if (idea.validations.length === 0) lines.push("还没有。这个想法到现在没去问过任何一个真人。");
  for (const v of idea.validations) {
    lines.push(
      `- ${day(v.contacted_at)}：有真实痛？${SIGNAL_LABEL[v.has_pain] ?? v.has_pain}；愿付钱？${SIGNAL_LABEL[v.will_pay] ?? v.will_pay}${v.note ? `。记录：${v.note}` : ""}`
    );
  }
  if (idea.exits.length) {
    lines.push("", "## 事先定好的退出条件", "");
    for (const e of idea.exits) {
      const t = e.triggered === "yes" ? "已经触发" : e.triggered === "no" ? "没触发" : "还没回头看";
      lines.push(`- ${e.criterion}（${t}）`);
    }
  }
  if (idea.predictions.length) {
    lines.push("", "## 押过的预测", "");
    for (const p of idea.predictions) {
      lines.push(`- ${p.text}（${day(p.due_at)} 到期，${OUTCOME_LABEL[p.outcome] ?? p.outcome}）${p.note ? `：${p.note}` : ""}`);
    }
  }
  if (idea.decisions.length) {
    lines.push("", "## 做过的决定", "");
    for (const d of idea.decisions) {
      lines.push(
        `- ${day(d.decided_at)} ${d.verdict}${d.reason ? `：${d.reason}` : ""}${d.learned ? `。学到了：${d.learned}` : ""}`
      );
    }
  }
  return lines.filter((l, i, all) => !(l === "" && all[i - 1] === "")).join("\n").trim() + "\n";
}

export function renderObservations(items: ContextObservation[]): string {
  const lines = [`# 观察（平时随手记下的，一共 ${items.length} 条，新的在上面）`, ""];
  if (items.length === 0) lines.push("还没有。");
  for (const o of items) {
    lines.push(`## ${day(o.created_at)}${o.tags.length ? ` · ${o.tags.join("、")}` : ""}`, "", o.raw_text.trim(), "", `（编号 ${o.id}）`, "");
  }
  return lines.join("\n").trim() + "\n";
}

export function renderMaterial(m: ContextMaterial): string {
  return [
    `# ${m.title?.trim() || "（没起标题的材料）"}`,
    "",
    `- 编号：${m.id}`,
    `- 类型：${m.source_type}`,
    `- 记下：${day(m.created_at)}`,
    "- 这是脱敏后的版本，遮掉的人名、公司名不要猜。",
    "",
    m.text.trim() || "（正文是空的）",
    "",
  ].join("\n");
}

export function renderJudgments(items: ContextJudgment[]): string {
  const lines = [
    `# 读新闻时写下的判断（一共 ${items.length} 条，新的在上面）`,
    "",
    "这些是用户的推测，不是事实。到期以后用户会回来对账：说中了还是没说中，没说中的话错在哪一步。",
    "",
  ];
  if (items.length === 0) lines.push("还没有。");
  for (const j of items) {
    const outcome = j.outcome ? OUTCOME_LABEL[j.outcome] ?? j.outcome : "—";
    lines.push(
      `## ${day(j.created_at)} · ${j.question}`,
      "",
      `- 读的新闻：${j.news_title}`,
      `- 用户的判断：${j.judgment}`,
      `- 到期：${day(j.due_at)}，结果：${outcome}${j.miss_reason ? `（错在：${MISS_LABEL[j.miss_reason] ?? j.miss_reason}）` : ""}`,
      j.tags.length ? `- 标签：${j.tags.join("、")}` : "",
      ""
    );
  }
  return lines.filter((l, i, all) => !(l === "" && all[i - 1] === "")).join("\n").trim() + "\n";
}

export function renderQuestion(q: ContextQuestion): string {
  const lines = [`# ${q.question}`, "", `- 编号：${q.id}`, `- 开始追：${day(q.created_at)}`, "", "## 用户的看法（只增不改，按时间顺序）", ""];
  if (q.views.length === 0) lines.push("还没写过看法。");
  for (const v of q.views) lines.push(`- ${day(v.created_at)}：${v.view}${v.reason ? `。理由：${v.reason}` : ""}`);
  return lines.join("\n").trim() + "\n";
}

export function renderLearnings(ideas: ContextIdea[]): string {
  const rows = ideas.flatMap((i) => i.decisions.filter((d) => str(d.learned)).map((d) => ({ idea: i, d })));
  const lines = [`# 学到了什么（做决定时写下的，一共 ${rows.length} 条）`, ""];
  if (rows.length === 0) lines.push("还没有。");
  for (const { idea, d } of rows) lines.push(`- ${day(d.decided_at)} 「${idea.title ?? "无题"}」${d.verdict}：${d.learned}`);
  return lines.join("\n").trim() + "\n";
}

export function renderIndex(data: ContextData): string {
  const byStatus = new Map<string, number>();
  for (const i of data.ideas) byStatus.set(i.status, (byStatus.get(i.status) ?? 0) + 1);
  const statusLine = Array.from(byStatus).map(([s, n]) => `${s} ${n} 个`).join("、") || "还没有";
  return [
    READER_RULES,
    "",
    "# 这里有什么",
    "",
    `导出时间：${data.exported_at.slice(0, 16).replace("T", " ")}（UTC）。这是一份快照，之后记的东西不在这里。`,
    "",
    `- ideas/：想法，一个想法一个文件（${statusLine}）`,
    `- observations.md：观察 ${data.observations.length} 条`,
    `- materials/：材料 ${data.materials.length} 份（脱敏版）`,
    `- judgments.md：读新闻写下的判断 ${data.judgments.length} 条`,
    `- questions/：用户在追的问题 ${data.questions.length} 个`,
    "- learnings.md：做决定时写下的「学到了什么」",
    "",
  ].join("\n");
}

/** 整个文件夹：相对路径 → 内容。 */
export function renderContextFiles(data: ContextData): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = [
    { path: "README.md", content: renderIndex(data) },
    { path: "observations.md", content: renderObservations(data.observations) },
    { path: "judgments.md", content: renderJudgments(data.judgments) },
    { path: "learnings.md", content: renderLearnings(data.ideas) },
  ];
  const used = new Set<string>();
  const unique = (dir: string, base: string, id: string) => {
    let p = `${dir}/${base}.md`;
    if (used.has(p)) p = `${dir}/${base}-${id.slice(0, 6)}.md`;
    used.add(p);
    return p;
  };
  for (const i of data.ideas) files.push({ path: unique("ideas", `${day(i.created_at)}-${slugify(i.title, i.id.slice(0, 8))}`, i.id), content: renderIdea(i) });
  for (const m of data.materials) files.push({ path: unique("materials", `${day(m.created_at)}-${slugify(m.title, m.id.slice(0, 8))}`, m.id), content: renderMaterial(m) });
  for (const q of data.questions) files.push({ path: unique("questions", slugify(q.question, q.id.slice(0, 8)), q.id), content: renderQuestion(q) });
  return files;
}

/** MCP 的搜索：在所有记录里找包含关键词的（不分大小写），每条给出处和一段上下文。 */
export function searchContext(data: ContextData, query: string, limit = 20): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: string[] = [];
  const snippet = (text: string) => {
    const at = text.toLowerCase().indexOf(q);
    const start = Math.max(0, at - 60);
    return (start > 0 ? "…" : "") + text.slice(start, at + q.length + 80).replace(/\s+/g, " ") + "…";
  };
  const check = (label: string, text: string) => {
    if (hits.length < limit && text.toLowerCase().includes(q)) hits.push(`${label}：${snippet(text)}`);
  };
  for (const i of data.ideas) check(`想法「${i.title ?? "无题"}」（${i.id}）`, renderIdea(i));
  for (const o of data.observations) check(`观察 ${day(o.created_at)}（${o.id}）`, o.raw_text);
  for (const m of data.materials) check(`材料「${m.title ?? "无题"}」（${m.id}）`, `${m.title ?? ""}\n${m.text}`);
  for (const j of data.judgments) check(`判断 ${day(j.created_at)}（${j.id}）`, `${j.question}\n${j.judgment}\n${j.news_title}`);
  for (const qq of data.questions) check(`在追的问题（${qq.id}）`, renderQuestion(qq));
  return hits;
}
