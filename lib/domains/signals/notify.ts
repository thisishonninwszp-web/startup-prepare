import nodemailer from "nodemailer";
import { supabaseAdmin } from "@/lib/supabase";
import type { BriefItem, BriefPracticeRow } from "./brief";
import { tokyoToday } from "./brief";
import { formatReportDate } from "./format";
import { dueJudgments, listJudgments } from "./practice";

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
  /** 每一节的精选（只要标题和两种提示）。 */
  sections: { title: string; items: Pick<BriefItem, "headline" | "related_question" | "surprise">[] }[];
  dueCount: number;
  freshQuestions: { question: string; freshCount: number }[];
  url: string | null;
};

/** 慢变量一周看一次：周一的邮件里提一句。 */
export function isMonday(date: string): boolean {
  return new Date(`${date}T12:00:00+09:00`).getUTCDay() === 1;
}

const SECTION_TITLES: Record<string, string> = {
  news: "今天的世界",
  calendar: "已经定了的未来",
  voices: "谁在头疼什么",
  money: "谁在掏钱",
  tools: "新工具和新可能",
};

/** 邮件正文（纯文本）。像一张便条：先说今天要做的一件事，再列标题，点进去看。 */
export function buildDailyEmail(input: DailyEmailInput): { subject: string; text: string } {
  const date = formatReportDate(input.date);
  const subject = input.practice
    ? `${date}的报告 · 今天的练习：${input.practice.question.slice(0, 40)}`
    : `${date}的报告好了`;
  const lines: string[] = [];
  if (input.digest) lines.push(input.digest, "");
  if (input.practice) {
    lines.push("今天的练习", `读这一条：${input.practice.headline}`, `问题：${input.practice.question}`, "先写下你的判断，再看 AI 怎么拆。", "");
  }
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
      if (item.surprise) lines.push(`  ↳ 意外：原本以为${item.surprise.expected}，结果${item.surprise.actual}。为什么？`);
      if (item.related_question) lines.push(`  ↳ 跟你在追的「${item.related_question.question}」有关`);
    }
    lines.push("");
  }
  if (isMonday(input.date)) {
    lines.push("今天是周一，看一眼慢变量：人口、劳动年龄人口、物价、汇率，这一周又往哪边挪了一点。");
    if (input.url) lines.push(`${input.url}/signals/slow`);
    lines.push("");
  }
  if (input.url) lines.push(`打开今天的报告：${input.url}/signals`);
  return { subject, text: lines.join("\n").trim() };
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

  const [judgments, questions] = await Promise.all([
    listJudgments(userId).catch(() => []),
    supabaseAdmin.from("signal_questions").select("question, research").eq("user_id", userId).is("archived_at", null),
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
