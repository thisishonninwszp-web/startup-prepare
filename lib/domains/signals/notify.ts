import nodemailer from "nodemailer";
import { describeMove, unusualFastMoves } from "./fast";
import { supabaseAdmin } from "@/lib/supabase";
import type { BriefItem, BriefPracticeRow } from "./brief";
import { tokyoToday } from "./brief";
import { formatReportDate } from "./format";
import { dueJudgments, listJudgments } from "./practice";
import { weekStartOf } from "./issue-shared";
import type { ItemFlow } from "./flow-shared";

/**
 * 每天早上的提醒邮件：报告好了以后发一封到他的邮箱，带上今天的练习题。
 * 习惯是靠提醒养起来的 —— 不提醒，"早上或中午看"很容易就忘了。
 *
 * 用 Gmail 的 SMTP 发，免费。要在环境变量里配：
 *   GMAIL_USER         发信用的 Gmail 地址
 *   GMAIL_APP_PASSWORD Gmail「应用专用密码」（不是登录密码；Google 账号 → 安全性 → 两步验证 → 应用专用密码）
 *   NOTIFY_EMAIL_TO    收信地址（不填就发给 GMAIL_USER 自己）
 *   APP_URL            邮件里的链接指向哪（比如 https://xxx.vercel.app）；不填就用 Vercel 自带的生产域名
 * 没配就不发，什么都不影响。
 */

export type EmailConfig = { ready: true; from: string; to: string } | { ready: false; missing: string[] };

export function emailConfig(env: Record<string, string | undefined> = process.env): EmailConfig {
  const missing = ["GMAIL_USER", "GMAIL_APP_PASSWORD"].filter((k) => !env[k]);
  if (missing.length > 0) return { ready: false, missing };
  return { ready: true, from: env.GMAIL_USER!, to: env.NOTIFY_EMAIL_TO || env.GMAIL_USER! };
}

function appUrl(env: Record<string, string | undefined> = process.env): string | null {
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, "");
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return null;
}

export type DailyEmailInput = {
  date: string;
  /** 今日总览（有就放在最前面）。 */
  digest?: string;
  practice: { question: string; headline: string } | null;
  overview: string | null;
  /** 今日总览挑的最值得点开的几条（最多 3 条）：标题、背景、一图看懂。 */
  top?: { signal_id: string; headline: string; background: string; flow?: ItemFlow }[];
  /** 每一节的精选：标题、背景（邮件里只放第一句）、两种提示。 */
  sections: { title: string; items: (Pick<BriefItem, "headline" | "related_question" | "surprise"> & { background?: string })[] }[];
  dueCount: number;
  freshQuestions: { question: string; freshCount: number }[];
  /** 这一周动得不寻常的快变量（已经写成一句话）。 */
  fastAlerts?: string[];
  /** 周五提醒周刊：这周还没写（unwritten），写了还没发（unpublished）；发了或不是周五为 null。 */
  issueReminder?: "unwritten" | "unpublished" | null;
  url: string | null;
};

/** 慢变量一周看一次：周一的邮件里提一句。 */
export function isMonday(date: string): boolean {
  return new Date(`${date}T12:00:00+09:00`).getUTCDay() === 1;
}

/** 周刊靠每周不断：周五的邮件里，这周还没发就提一句。 */
export function isFriday(date: string): boolean {
  return new Date(`${date}T12:00:00+09:00`).getUTCDay() === 5;
}

const SECTION_TITLES: Record<string, string> = {
  news: "今天的世界",
  calendar: "已经定了的未来",
  voices: "谁在头疼什么",
  money: "谁在掏钱",
  tools: "新工具和新可能",
};

/** 一段话的第一句（邮件里各条只放一句）。 */
export function firstSentence(text: string): string {
  return text.match(/^[^。！？]+[。！？]?/)?.[0] ?? text;
}

/** 邮件正文（纯文本）。像一张便条：先说今天要做的一件事，再列标题，点进去看。 */
export function buildDailyEmail(input: DailyEmailInput): { subject: string; text: string } {
  const date = formatReportDate(input.date);
  const subject = input.practice
    ? `${date}的报告 · 今天的练习：${input.practice.question.slice(0, 40)}`
    : `${date}的报告好了`;
  const lines: string[] = [];
  if (input.digest) lines.push(input.digest, "");
  if (input.top && input.top.length > 0) {
    lines.push("最值得点开的几条");
    for (const t of input.top) lines.push(`· ${t.headline}`, `  ${t.background}`);
    lines.push("");
  }
  if (input.practice) {
    lines.push("今天的练习", `读这一条：${input.practice.headline}`, `问题：${input.practice.question}`, "先写下你的判断，再看 AI 怎么拆。", "");
  }
  if (input.fastAlerts && input.fastAlerts.length > 0) lines.push("这一周动得不寻常的：", ...input.fastAlerts.map((a) => `· ${a}`), "");
  if (input.dueCount > 0) lines.push(`有 ${input.dueCount} 条判断到期了，去对一下账。`, "");
  for (const q of input.freshQuestions) {
    lines.push(`你在追的「${q.question}」：和上一轮比，新冒出来 ${q.freshCount} 条证据。`);
  }
  if (input.freshQuestions.length > 0) lines.push("");
  if (input.overview) lines.push(input.overview, "");
  for (const s of input.sections) {
    if (s.items.length === 0) continue;
    lines.push(`【${s.title}】`);
    for (const item of s.items) {
      lines.push(`· ${item.headline}`);
      if (item.background) lines.push(`  ${firstSentence(item.background)}`);
      if (item.surprise) lines.push(`  ↳ 意外：原本以为${item.surprise.expected}，结果${item.surprise.actual}。为什么？`);
      if (item.related_question) lines.push(`  ↳ 跟你在追的「${item.related_question.question}」有关`);
    }
    lines.push("");
  }
  if (input.issueReminder) {
    lines.push(
      input.issueReminder === "unwritten"
        ? "今天周五，这周的周刊还没写。挑一两条、每条点三下就是判断，十分钟的事。"
        : "今天周五，这周的周刊写好了，还没发出去。"
    );
    if (input.url) lines.push(`${input.url}/signals/issue`);
    lines.push("");
  }
  if (isMonday(input.date)) {
    lines.push("今天是周一，看一眼慢变量：人口、劳动年龄人口、物价、汇率，这一周又往哪边挪了一点。");
    if (input.url) lines.push(`${input.url}/signals/slow`);
    lines.push("上一周的周报也可以看了：七天连起来，哪件事一直在响、哪件只响了一天。");
    if (input.url) lines.push(`${input.url}/signals/week`);
    lines.push("");
  }
  if (input.url) lines.push(`打开今天的报告：${input.url}/signals`);
  return { subject, text: lines.join("\n").trim() };
}

/** 邮件颜色：由 app/globals.css 的语义 token 换算成 hex（邮件客户端不一定认 hsl() 和 CSS 变量）。 */
const EMAIL_COLOR = { paper: "#faf9f7", card: "#ffffff", ink: "#211f1c", accent: "#dd4913", muted: "#706b66", rule: "#e1dfdb" };

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * HTML 版邮件：最值得点开的几条带背景和一图看懂（images：signal_id → 附件的 cid，没有的就不放图），各节每条标题 + 一句话。
 * 只用行内样式（邮件客户端不认外部样式和 flex）。和纯文字版同一个顺序 —— 改一个记得改另一个。
 */
export function buildDailyEmailHtml(input: DailyEmailInput, images: Record<string, string>): string {
  const C = EMAIL_COLOR;
  const para = (text: string, style = "") => `<p style="margin:0 0 12px;font-size:15px;line-height:1.75;color:${C.ink};${style}">${esc(text)}</p>`;
  const head = (text: string) => `<p style="margin:28px 0 8px;font-size:13px;color:${C.muted};">${esc(text)}</p>`;
  const link = (href: string, text: string) => `<p style="margin:0 0 12px;font-size:14px;"><a href="${esc(href)}" style="color:${C.accent};">${esc(text)}</a></p>`;
  const parts: string[] = [];
  if (input.digest) parts.push(para(input.digest));
  if (input.top && input.top.length > 0) {
    parts.push(head("最值得点开的几条"));
    for (const t of input.top) {
      parts.push(`<div style="margin:0 0 20px;padding:14px 16px;border:1px solid ${C.rule};border-radius:8px;background:${C.card};">`);
      parts.push(para(t.headline, "font-weight:600;"), para(t.background));
      const cid = images[t.signal_id];
      if (cid) parts.push(`<img src="cid:${esc(cid)}" alt="一图看懂" width="560" style="display:block;width:100%;max-width:560px;height:auto;border-radius:6px;" />`);
      parts.push("</div>");
    }
  }
  if (input.practice) {
    parts.push(head("今天的练习"), para(`读这一条：${input.practice.headline}`), para(`问题：${input.practice.question}`), para("先写下你的判断，再看 AI 怎么拆。", `color:${C.muted};`));
  }
  if (input.fastAlerts && input.fastAlerts.length > 0) parts.push(head("这一周动得不寻常的"), ...input.fastAlerts.map((a) => para(`· ${a}`)));
  if (input.dueCount > 0) parts.push(para(`有 ${input.dueCount} 条判断到期了，去对一下账。`));
  for (const q of input.freshQuestions) parts.push(para(`你在追的「${q.question}」：和上一轮比，新冒出来 ${q.freshCount} 条证据。`));
  if (input.overview) parts.push(para(input.overview));
  for (const s of input.sections) {
    if (s.items.length === 0) continue;
    parts.push(head(`【${s.title}】`));
    for (const item of s.items) {
      parts.push(para(`· ${item.headline}`, "margin-bottom:2px;"));
      if (item.background) parts.push(para(firstSentence(item.background), `font-size:14px;color:${C.muted};`));
      if (item.surprise) parts.push(para(`↳ 意外：原本以为${item.surprise.expected}，结果${item.surprise.actual}。为什么？`, "font-size:14px;"));
      if (item.related_question) parts.push(para(`↳ 跟你在追的「${item.related_question.question}」有关`, "font-size:14px;"));
    }
  }
  if (input.issueReminder) {
    parts.push(
      para(
        input.issueReminder === "unwritten"
          ? "今天周五，这周的周刊还没写。挑一两条、每条点三下就是判断，十分钟的事。"
          : "今天周五，这周的周刊写好了，还没发出去。"
      )
    );
    if (input.url) parts.push(link(`${input.url}/signals/issue`, "去写周刊"));
  }
  if (isMonday(input.date)) {
    parts.push(para("今天是周一，看一眼慢变量：人口、劳动年龄人口、物价、汇率，这一周又往哪边挪了一点。"));
    if (input.url) parts.push(link(`${input.url}/signals/slow`, "慢变量"), link(`${input.url}/signals/week`, "上一周的周报"));
  }
  if (input.url) parts.push(link(`${input.url}/signals`, "打开今天的报告"));
  return `<!doctype html><html><body style="margin:0;padding:24px 16px;background:${C.paper};font-family:-apple-system,'PingFang SC','Hiragino Sans','Noto Sans SC',sans-serif;"><div style="max-width:600px;margin:0 auto;">${parts.join("")}</div></body></html>`;
}

/** 这周的周刊写了没、发了没。表还没建（071 没跑）就不提。 */
async function weeklyIssueReminder(userId: string, date: string): Promise<DailyEmailInput["issueReminder"]> {
  const { data, error } = await supabaseAdmin
    .from("signal_issues")
    .select("drafts, published")
    .eq("user_id", userId)
    .eq("week_start", weekStartOf(date))
    .maybeSingle();
  if (error) return null;
  if (!data || !data.drafts) return "unwritten";
  return ((data.published as unknown[] | null) ?? []).length > 0 ? null : "unpublished";
}

async function loadEmailInput(userId: string, date: string): Promise<DailyEmailInput | null> {
  const { data, error } = await supabaseAdmin
    .from("signal_briefs")
    .select("kind, items, overview, practice")
    .eq("user_id", userId)
    .eq("brief_date", date);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  const byKind = new Map(data.map((b) => [b.kind as string, b]));
  const digest = (byKind.get("digest")?.overview as string | null) ?? undefined;
  const news = byKind.get("news");
  const practiceRow = (news?.practice as BriefPracticeRow | null) ?? null;
  const newsItems = ((news?.items as BriefItem[] | null) ?? []).filter((i) => !i.extra);
  const practiceItem = practiceRow ? newsItems.find((i) => i.signal_id === practiceRow.signal_id) : undefined;

  const [judgments, questions, fast, issueReminder] = await Promise.all([
    listJudgments(userId).catch(() => []),
    supabaseAdmin.from("signal_questions").select("question, research").eq("user_id", userId).is("archived_at", null),
    unusualFastMoves().catch(() => []),
    isFriday(date) ? weeklyIssueReminder(userId, date) : Promise.resolve(null),
  ]);
  const freshQuestions = (questions.error ? [] : questions.data ?? [])
    .map((q) => ({
      question: q.question as string,
      freshCount: ((q.research as { freshCount?: number } | null)?.freshCount ?? 0) as number,
    }))
    .filter((q) => q.freshCount > 0);

  return {
    date,
    digest,
    practice: practiceRow ? { question: practiceRow.question, headline: practiceItem?.headline ?? "" } : null,
    overview: (news?.overview as string | null) ?? null,
    sections: ["news", "calendar", "voices", "money", "tools"].map((kind) => ({
      title: SECTION_TITLES[kind],
      items: ((byKind.get(kind)?.items as BriefItem[] | null) ?? [])
        .filter((i) => !i.extra)
        // 练习题那一条不在列表里剧透
        .filter((i) => i.signal_id !== practiceRow?.signal_id),
    })),
    dueCount: dueJudgments(judgments).length,
    freshQuestions,
    fastAlerts: fast.map(describeMove),
    issueReminder,
    url: appUrl(),
  };
}

export type SendOutcome = { sent: true; to: string } | { sent: false; reason: string };

/** 把今天的报告发到他的邮箱。没配、或者今天还没有报告，就不发并说明原因。 */
export async function sendDailyEmail(userId: string, date = tokyoToday()): Promise<SendOutcome> {
  const config = emailConfig();
  if (!config.ready) return { sent: false, reason: `还没配好：缺 ${config.missing.join("、")}` };
  const input = await loadEmailInput(userId, date);
  if (!input) return { sent: false, reason: "今天的报告还没生成" };
  const { subject, text } = buildDailyEmail(input);
  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: { user: config.from, pass: process.env.GMAIL_APP_PASSWORD },
  });
  await transport.sendMail({ from: `IdeaOS <${config.from}>`, to: config.to, subject, text });
  return { sent: true, to: config.to };
}
