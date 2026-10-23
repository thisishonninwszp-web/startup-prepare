import nodemailer from "nodemailer";
import { memberAccounts } from "./users";
import { publicItem } from "./shared-view";
import { describeMove, unusualFastMoves } from "./fast";
import { supabaseAdmin } from "@/lib/supabase";
import type { BriefItem, BriefPracticeRow } from "./brief";
import { tokyoToday } from "./brief";
import { formatReportDate } from "./format";
import { dueJudgments, listJudgments } from "./practice";
import { weekStartOf } from "./issue-shared";
import type { ItemFlow } from "./flow-shared";
import type { DigestPick } from "./digest";
import { cleanBriefItem } from "./filler";
import { signFlowCard } from "./flow-card-shared";
import { followReasonText } from "./memory-shared";
import { MY_TIERS, pct } from "./forecast-shared";
import { actionSecret, actionUrl, signAction, type ActionKind } from "@/lib/action-links";
import { loadTodayPersonal } from "./today";
import { DB_LIMIT_BYTES, storageReport } from "./storage";

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
  sections: { title: string; items: (Pick<BriefItem, "headline" | "related_question" | "surprise"> & { signal_id?: string; background?: string })[] }[];
  dueCount: number;
  freshQuestions: { question: string; freshCount: number }[];
  /** 这一周动得不寻常的快变量（已经写成一句话）。 */
  fastAlerts?: string[];
  /** 周五提醒周刊：这周还没写（unwritten），写了还没发（unpublished）；发了或不是周五为 null。 */
  issueReminder?: "unwritten" | "unpublished" | null;
  /** 他在跟的事有新消息（「今天」一页的同一块，最多 3 件、每件 2 条）。每人一份。 */
  stories?: { title: string; reason: string; updates: { id: string; title: string }[] }[];
  /** 回想一条（间隔重复到期的）：先想、点链接再看答案。每人一份。 */
  recall?: { title: string; reason: string; url: string } | null;
  /** 点一下就标上的链接（signal_id → 两个链接），每人一份口令。 */
  markLinks?: Record<string, { important: string; mine: string }>;
  /** 数据库用了免费版上限的百分之几（到 STORAGE_WARN_PCT 才提醒；只发给主账号）。 */
  storagePct?: number | null;
  /** 等他判断的第一道题：点一档就记上（每一档一个链接）。 */
  forecastQuick?: { title: string; links: { label: string; url: string }[] } | null;
  /** 预测题里等他做的：等判断几道（第一道的题目）、生意题等确认几道。每人一份。 */
  forecastTodo?: { toForecast: number; first: string | null; toConfirm: number } | null;
  url: string | null;
};

/** 数据库用到上限的这么多就在邮件里提醒（每月约多 85MB，60% 时大约还剩两个月）。 */
export const STORAGE_WARN_PCT = 60;

function storageWarning(pct: number | null | undefined): string | null {
  return pct !== null && pct !== undefined && pct >= STORAGE_WARN_PCT
    ? `数据库已经用了免费版上限（500MB）的 ${pct}%：该决定怎么整理旧数据（或者升级）了，记忆页最下面有各张表多大。`
    : null;
}

/** 每月 2 号提醒下载上个月的备份（1 号早上的后台任务刚打包好）。 */
export function isArchiveDay(date: string): boolean {
  return date.slice(8, 10) === "02";
}

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
  if (input.stories && input.stories.length > 0) {
    lines.push("你在跟的事，有新消息");
    for (const s of input.stories) {
      lines.push(`· ${s.title}（${s.reason}）`);
      for (const u of s.updates) lines.push(`  → ${u.title}`);
    }
    lines.push("");
  }
  if (input.recall) {
    const r = input.recall;
    lines.push("回想", `${r.reason}：${r.title}`, "  先别往下看：当时你为什么在意？后来怎样了？想好了再点开看答案：", `  ${r.url}`, "");
  }
  if (input.practice) {
    lines.push("今天的练习", `读这一条：${input.practice.headline}`, `问题：${input.practice.question}`, "先写下你的判断，再看 AI 怎么拆。", "");
  }
  if (input.fastAlerts && input.fastAlerts.length > 0) lines.push("这一周动得不寻常的：", ...input.fastAlerts.map((a) => `· ${a}`), "");
  if (input.dueCount > 0) lines.push(`有 ${input.dueCount} 条判断到期了，去对一下账。`, "");
  for (const line of forecastTodoLines(input.forecastTodo)) lines.push(line);
  if (input.forecastTodo) lines.push(...(input.url ? [`${input.url}/signals/forecast`] : []), "");
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
  const warn = storageWarning(input.storagePct);
  if (warn) lines.push(warn, ...(input.url ? [`${input.url}/signals/memory#storage`] : []), "");
  if (isArchiveDay(input.date) && input.url) lines.push("上个月的存档打包好了：下载一份放在自己电脑上，就是完整的离线备份。", `${input.url}/signals/memory#storage`, "");
  if (input.url) lines.push(`打开今天的报告：${input.url}/signals`);
  return { subject, text: lines.join("\n").trim() };
}

/** 预测题里等他做的，写成一两句。 */
function forecastTodoLines(todo: DailyEmailInput["forecastTodo"]): string[] {
  if (!todo) return [];
  const out: string[] = [];
  if (todo.toForecast > 0) out.push(`有 ${todo.toForecast} 道预测题等你判断${todo.first ? `，比如：${todo.first}` : ""}`);
  if (todo.toConfirm > 0) out.push(`有 ${todo.toConfirm} 道生意题到期了，等你确认对账。`);
  return out;
}

/** 邮件颜色：由 app/globals.css 的语义 token 换算成 hex（邮件客户端不一定认 hsl() 和 CSS 变量）。tint 是「给你的」那一框的底色。 */
const EMAIL_COLOR = { paper: "#faf9f7", card: "#ffffff", ink: "#211f1c", accent: "#dd4913", muted: "#706b66", rule: "#e1dfdb", tint: "#fbf1ec" };

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 前两句（头版卡片上的背景不用全文）。 */
function firstSentences(text: string, n = 2): string {
  const parts = text.match(/[^。！？!?]+[。！？!?]?/g) ?? [text];
  return parts.slice(0, n).join("").trim();
}

/** 读完大约几分钟（中文一分钟读五百字上下，按纯文字版的长度算）。 */
export function readingMinutes(text: string): number {
  return Math.max(1, Math.round(text.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, "").length / 500));
}

/**
 * HTML 版邮件：按报纸排，内容和纯文字版一样，只是让人扫一眼就知道今天有什么、哪里要细看 ——
 * 报头（日期、几分钟读完、各块几条）→ 头版（今日总览、最值得点开的几条带一图看懂、本周异动）→
 * 「给你的」一框（回想、在跟的事、预测、练习、在追的问题：要他动手的都在这里）→ 各版（每节一条粗线开头，每条粗体标题加一句话）→ 提醒。
 * 只用行内样式和表格（邮件客户端不认外部样式和 flex）。images：signal_id → 附件的 cid，没有的就不放图。
 */
export function buildDailyEmailHtml(input: DailyEmailInput, images: Record<string, string>): string {
  const C = EMAIL_COLOR;
  const para = (text: string, style = "") => `<p style="margin:0 0 12px;font-size:15px;line-height:1.75;color:${C.ink};${style}">${esc(text)}</p>`;
  const kicker = (text: string, color = C.accent) =>
    `<p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.08em;color:${color};">${esc(text)}</p>`;
  const link = (href: string, text: string) => `<p style="margin:0 0 12px;font-size:14px;"><a href="${esc(href)}" style="color:${C.accent};">${esc(text)}</a></p>`;
  // 点一下就标上（进记忆、进「在跟的事」、以后会回想）
  const markInline = (m: { important: string; mine: string }) =>
    `<span style="font-size:12px;color:${C.muted};white-space:nowrap;"> · 标一下：<a href="${esc(m.important)}" style="color:${C.muted};">重要</a> / <a href="${esc(m.mine)}" style="color:${C.muted};">跟我有关</a></span>`;
  const markLine = (m: { important: string; mine: string }) => `<p style="margin:0 0 4px;">${markInline(m).replace(" · ", "")}</p>`;
  const rule = `<div style="height:1px;background:${C.rule};margin:14px 0;"></div>`;

  const { text } = buildDailyEmail(input);
  const sections = input.sections.filter((s) => s.items.length > 0);
  const sectionCount = sections.reduce((n, s) => n + s.items.length, 0);

  // 「给你的」一框：要他动手的都放这里
  const mine: string[] = [];
  if (input.recall) {
    const r = input.recall;
    mine.push(
      kicker("回想", C.ink) +
        para(`${r.reason}：${r.title}`, "font-weight:600;margin-bottom:4px;") +
        para("先别往下看：当时你为什么在意？后来怎样了？在心里说一遍。", `font-size:14px;color:${C.muted};margin-bottom:6px;`) +
        link(r.url, "想好了，看答案 →")
    );
  }
  if (input.stories && input.stories.length > 0) {
    const rows = input.stories.map(
      (st) =>
        para(`${st.title}（${st.reason}）`, "font-weight:600;margin-bottom:2px;") +
        st.updates
          .map((u) =>
            input.url
              ? `<p style="margin:0 0 4px 12px;font-size:14px;line-height:1.7;"><a href="${esc(`${input.url}/signals/${u.id}`)}" style="color:${C.accent};">→ ${esc(u.title)}</a></p>`
              : para(`→ ${u.title}`, "font-size:14px;margin-left:12px;margin-bottom:4px;")
          )
          .join("")
    );
    mine.push(kicker("你在跟的事，有新消息", C.ink) + rows.join(""));
  }
  const forecastBits: string[] = [];
  if (input.forecastQuick) {
    forecastBits.push(
      para(`先说你的判断：${input.forecastQuick.title}`, "font-size:14px;font-weight:600;margin-bottom:6px;"),
      `<p style="margin:0 0 10px;font-size:13px;line-height:2.2;">${input.forecastQuick.links
        .map((l) => `<a href="${esc(l.url)}" style="color:${C.accent};text-decoration:none;border:1px solid ${C.accent};border-radius:999px;padding:2px 9px;margin-right:2px;white-space:nowrap;">${esc(l.label)}</a>`)
        // 几个之间留空格：手机上一行放不下时才能换行
        .join(" ")}</p>`
    );
  }
  for (const line of forecastTodoLines(input.forecastTodo)) forecastBits.push(para(line, "font-size:14px;margin-bottom:4px;"));
  if (input.dueCount > 0) forecastBits.push(para(`有 ${input.dueCount} 条判断到期了，去对一下账。`, "font-size:14px;margin-bottom:4px;"));
  if (input.forecastTodo && input.url) forecastBits.push(link(`${input.url}/signals/forecast`, "去判断 →"));
  if (forecastBits.length > 0) mine.push(kicker("预测", C.ink) + forecastBits.join(""));
  if (input.practice) {
    mine.push(
      kicker("今天的练习", C.ink) +
        para(`读这一条：${input.practice.headline}`, "font-size:14px;margin-bottom:4px;") +
        para(`问题：${input.practice.question}`, "font-size:14px;font-weight:600;margin-bottom:4px;") +
        para("先写下你的判断，再看 AI 怎么拆。", `font-size:13px;color:${C.muted};`)
    );
  }
  if (input.freshQuestions.length > 0) {
    mine.push(
      kicker("你在追的问题", C.ink) +
        input.freshQuestions.map((q) => para(`「${q.question}」：和上一轮比，新冒出来 ${q.freshCount} 条证据。`, "font-size:14px;margin-bottom:4px;")).join("")
    );
  }

  const parts: string[] = [];
  // 收件箱列表里预览的那一行
  const preheader = input.digest ? firstSentence(input.digest) : input.top?.[0]?.headline ?? "";
  if (preheader) parts.push(`<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>`);

  // 报头
  parts.push(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:2px solid ${C.ink};"><tr>` +
      `<td style="padding:0 0 6px;font-size:22px;font-weight:700;color:${C.ink};">IdeaOS 早报</td>` +
      `<td align="right" style="padding:0 0 6px;font-size:13px;color:${C.muted};">${esc(formatReportDate(input.date))}</td>` +
      `</tr></table>`,
    `<p style="margin:6px 0 22px;font-size:12px;color:${C.muted};">约 ${readingMinutes(text)} 分钟读完${(input.top?.length ?? 0) > 0 ? ` · 头版 ${input.top?.length} 条` : ""}${mine.length > 0 ? ` · 给你的 ${mine.length} 件` : ""}${sectionCount > 0 ? ` · ${sections.length} 个版面 ${sectionCount} 条` : ""}</p>`
  );

  // 头版
  if (input.digest || (input.top && input.top.length > 0)) {
    parts.push(kicker("头版"));
    if (input.digest) {
      input.digest
        .split(/\n+/)
        .map((p) => p.trim())
        .filter(Boolean)
        .forEach((p, i) => parts.push(para(p, i === 0 ? "font-size:17px;line-height:1.7;font-weight:600;" : "")));
    }
    for (const t of input.top ?? []) {
      parts.push(`<div style="margin:6px 0 16px;padding:14px 16px;border:1px solid ${C.rule};border-radius:8px;background:${C.card};">`);
      parts.push(para(t.headline, "font-size:16px;font-weight:700;margin-bottom:6px;"), para(firstSentences(t.background), `font-size:14px;color:${C.muted};margin-bottom:8px;`));
      const cid = images[t.signal_id];
      if (cid) parts.push(`<img src="cid:${esc(cid)}" alt="一图看懂" width="560" style="display:block;width:100%;max-width:560px;height:auto;border-radius:6px;margin-bottom:6px;" />`);
      const marks = input.markLinks?.[t.signal_id];
      if (marks) parts.push(markLine(marks));
      parts.push("</div>");
    }
    if (input.fastAlerts && input.fastAlerts.length > 0) {
      parts.push(
        `<div style="margin:0 0 16px;padding:10px 14px;border-left:3px solid ${C.rule};">${kicker("这一周动得不寻常的", C.muted)}${input.fastAlerts
          .map((a) => para(a, "font-size:14px;margin-bottom:4px;"))
          .join("")}</div>`
      );
    }
  }

  // 给你的
  if (mine.length > 0) {
    parts.push(
      `<div style="margin:22px 0;padding:16px 18px;background:${C.tint};border-left:3px solid ${C.accent};border-radius:6px;">${kicker("给你的")}${mine.join(rule)}</div>`
    );
  }

  // 各版
  for (const sec of sections) {
    parts.push(
      `<div style="margin:26px 0 10px;border-top:2px solid ${C.ink};padding-top:6px;"><span style="font-size:15px;font-weight:700;color:${C.ink};">${esc(sec.title)}</span><span style="font-size:12px;color:${C.muted};margin-left:8px;">${sec.items.length} 条</span></div>`
    );
    if (sec === sections[0] && input.overview && sec.title === "今天的世界") parts.push(para(input.overview, `font-size:14px;color:${C.muted};`));
    sec.items.forEach((item, i) => {
      const marks = item.signal_id ? input.markLinks?.[item.signal_id] : undefined;
      parts.push(
        `<div style="margin:0 0 12px;">` +
          `<p style="margin:0 0 2px;font-size:15px;line-height:1.6;font-weight:600;color:${C.ink};"><span style="font-family:Menlo,monospace;font-size:12px;font-weight:400;color:${C.muted};margin-right:6px;">${String(i + 1).padStart(2, "0")}</span>${esc(item.headline)}</p>` +
          (item.background || marks
            ? `<p style="margin:0;font-size:13.5px;line-height:1.65;color:${C.muted};">${item.background ? esc(firstSentence(item.background)) : ""}${marks ? markInline(marks) : ""}</p>`
            : "") +
          (item.surprise
            ? `<p style="margin:2px 0 0;font-size:13.5px;line-height:1.65;color:${C.accent};">↳ 意外：原本以为${esc(item.surprise.expected)}，结果${esc(item.surprise.actual)}。为什么？</p>`
            : "") +
          (item.related_question ? `<p style="margin:2px 0 0;font-size:13.5px;line-height:1.65;color:${C.ink};">↳ 跟你在追的「${esc(item.related_question.question)}」有关</p>` : "") +
          `</div>`
      );
    });
  }
  // 「今天的世界」那一节没有条目、导语还在的话，单独放
  if (input.overview && !(sections[0]?.title === "今天的世界")) parts.push(para(input.overview, `font-size:14px;color:${C.muted};`));

  // 提醒
  const notes: string[] = [];
  const warn = storageWarning(input.storagePct);
  if (warn) notes.push(para(warn, "font-size:14px;font-weight:600;margin-bottom:4px;") + (input.url ? link(`${input.url}/signals/memory#storage`, "看各张表多大") : ""));
  if (input.issueReminder) {
    notes.push(
      para(
        input.issueReminder === "unwritten" ? "今天周五，这周的周刊还没写。挑一两条、每条点三下就是判断，十分钟的事。" : "今天周五，这周的周刊写好了，还没发出去。",
        "font-size:14px;margin-bottom:4px;"
      ) + (input.url ? link(`${input.url}/signals/issue`, "去写周刊") : "")
    );
  }
  if (isMonday(input.date)) {
    notes.push(
      para("今天是周一，看一眼慢变量：人口、劳动年龄人口、物价、汇率，这一周又往哪边挪了一点。", "font-size:14px;margin-bottom:4px;") +
        (input.url ? link(`${input.url}/signals/slow`, "慢变量") + link(`${input.url}/signals/week`, "上一周的周报") : "")
    );
  }
  if (isArchiveDay(input.date) && input.url) {
    notes.push(para("上个月的存档打包好了：下载一份放在自己电脑上，就是完整的离线备份。", "font-size:14px;margin-bottom:4px;") + link(`${input.url}/signals/memory#storage`, "去下载"));
  }
  if (notes.length > 0) parts.push(`<div style="margin:26px 0 0;padding:14px 16px;background:${C.card};border:1px solid ${C.rule};border-radius:6px;">${kicker("提醒", C.muted)}${notes.join(rule)}</div>`);

  if (input.url) {
    parts.push(
      `<p style="margin:28px 0 8px;text-align:center;"><a href="${esc(`${input.url}/signals`)}" style="display:inline-block;padding:10px 22px;border:1px solid ${C.ink};border-radius:999px;color:${C.ink};text-decoration:none;font-size:14px;">打开今天的报告</a></p>`
    );
  }
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
  // 今日总览挑的那几条：标题、背景、一图看懂（练习题那一条不剧透）
  const allItems = ["news", "calendar", "voices", "money", "tools"].flatMap((k) =>
    ((byKind.get(k)?.items as BriefItem[] | null) ?? []).filter((i) => !i.extra).map(cleanBriefItem)
  );
  const top = ((byKind.get("digest")?.items as DigestPick[] | null) ?? []).slice(0, 3).flatMap((p) => {
    const item = allItems.find((i) => i.signal_id === p.signal_id);
    if (!item || item.signal_id === practiceRow?.signal_id) return [];
    return [{ signal_id: item.signal_id, headline: item.headline, background: item.background, ...(item.flow ? { flow: item.flow } : {}) }];
  });

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
    top,
    practice: practiceRow ? { question: practiceRow.question, headline: practiceItem?.headline ?? "" } : null,
    overview: (news?.overview as string | null) ?? null,
    sections: ["news", "calendar", "voices", "money", "tools"].map((kind) => ({
      title: SECTION_TITLES[kind],
      items: ((byKind.get(kind)?.items as BriefItem[] | null) ?? [])
        .filter((i) => !i.extra)
        // 练习题那一条不在列表里剧透
        .filter((i) => i.signal_id !== practiceRow?.signal_id)
        .map(cleanBriefItem),
    })),
    dueCount: dueJudgments(judgments).length,
    freshQuestions,
    fastAlerts: fast.map(describeMove),
    issueReminder,
    storagePct: await storageReport()
      .then((r) => (r ? Math.round((r.total / DB_LIMIT_BYTES) * 100) : null))
      .catch(() => null),
    url: appUrl(),
  };
}

/** 这封邮件里出现的新闻（最值得点开的几条、各节的精选），给它们配「点一下就标上」的链接。 */
function emailSignalIds(input: DailyEmailInput): string[] {
  const ids = [...(input.top ?? []).map((t) => t.signal_id), ...input.sections.flatMap((s) => s.items.map((i) => i.signal_id ?? ""))];
  return Array.from(new Set(ids.filter(Boolean)));
}

/** 邮件里每人一份的几块（跟「今天」一页同一份，代码算的，不调 AI）。取不到就不放，不拦着发邮件。 */
async function personalParts(
  userId: string,
  date: string,
  signalIds: string[]
): Promise<Pick<DailyEmailInput, "stories" | "recall" | "forecastTodo" | "markLinks" | "forecastQuick">> {
  try {
    const t = await loadTodayPersonal(userId, date);
    const f = t.forecast;
    const base = appUrl();
    const secret = actionSecret();
    // 点一下就完成的链接：口令里写着是谁、做什么（见 lib/action-links.ts）；网址或密钥没配就不放
    const tap = (k: ActionKind, target: string, v: string) => (base && secret ? actionUrl(base, signAction({ u: userId, k, t: target, v }, secret)) : null);
    const recallItem = t.recall?.items[0];
    const recallUrl = recallItem ? tap("recall", recallItem.signal_id, "") : null;
    const first = f?.toForecast[0];
    const tiers = first ? MY_TIERS.map((p) => ({ label: pct(p), url: tap("forecast", first.id, String(p)) })) : [];
    return {
      recall: recallItem && recallUrl ? { title: recallItem.title ?? "（没有标题）", reason: recallItem.reason, url: recallUrl } : null,
      markLinks: Object.fromEntries(
        signalIds.flatMap((id) => {
          const important = tap("mark", id, "important");
          const mine = tap("mark", id, "mine");
          return important && mine ? [[id, { important, mine }]] : [];
        })
      ),
      forecastQuick: first && tiers.every((x) => x.url) ? { title: first.title, links: tiers as { label: string; url: string }[] } : null,
      stories: Array.isArray(t.stories)
        ? t.stories.slice(0, 3).map((s) => ({
            title: s.followed.title ?? "（没有标题）",
            reason: followReasonText(s.followed),
            updates: s.updates.slice(0, 2).map((u) => ({ id: u.id, title: u.title ?? "（没有标题）" })),
          }))
        : [],
      forecastTodo: f && (f.toForecast.length > 0 || f.toConfirm > 0) ? { toForecast: f.toForecast.length, first: f.toForecast[0]?.title ?? null, toConfirm: f.toConfirm } : null,
    };
  } catch (e) {
    console.error("email personal parts", userId, e);
    return {};
  }
}

export type SendOutcome = { sent: true; to: string } | { sent: false; reason: string };

/**
 * 最值得点开的几条里有一图看懂的，签好名去 Edge 路由取 PNG，当附件嵌进邮件（cid）。
 * 网址或 CRON_SECRET 没配、路由取不到、超过 10 秒，就只发文字 —— 不拦着发邮件。
 */
async function flowCardAttachments(input: DailyEmailInput): Promise<{ signalId: string; filename: string; content: Buffer; cid: string }[]> {
  const secret = process.env.CRON_SECRET;
  if (!input.url || !secret) return [];
  const results = await Promise.all(
    (input.top ?? []).map(async (t) => {
      if (!t.flow) return null;
      try {
        const { d, s } = await signFlowCard({ headline: t.headline, flow: t.flow }, secret);
        const res = await fetch(`${input.url}/api/flow-card?d=${d}&s=${s}`, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return null;
        return { signalId: t.signal_id, filename: `flow-${t.signal_id}.png`, content: Buffer.from(await res.arrayBuffer()), cid: `flow-${t.signal_id}@ideaos` };
      } catch {
        return null;
      }
    })
  );
  return results.filter((r): r is NonNullable<typeof r> => r !== null);
}

/**
 * 同一份报告发给名单上已经注册的朋友（IDEAOS_MEMBERS）：内容和主账号那封一样（不多花一分 AI 的钱），
 * 去掉只关于主账号的几句（跟你、你在追的问题、周刊提醒），到期的判断换成他自己的。一人一封。
 */
export async function sendMemberEmails(ownerId: string, date = tokyoToday()): Promise<string[]> {
  const config = emailConfig();
  if (!config.ready) return [];
  const members = await memberAccounts();
  if (members.length === 0) return [];
  const base = await loadEmailInput(ownerId, date);
  if (!base) return [];
  const attachments = await flowCardAttachments(base);
  const images = Object.fromEntries(attachments.map((a) => [a.signalId, a.cid]));
  const transport = nodemailer.createTransport({ service: "gmail", auth: { user: config.from, pass: process.env.GMAIL_APP_PASSWORD } });
  const sent: string[] = [];
  for (const m of members) {
    const [judgments, personal] = await Promise.all([listJudgments(m.id).catch(() => []), personalParts(m.id, date, emailSignalIds(base))]);
    const input: DailyEmailInput = {
      ...base,
      ...personal,
      sections: base.sections.map((s) => ({ ...s, items: s.items.map(publicItem) })),
      dueCount: dueJudgments(judgments).length,
      freshQuestions: [],
      issueReminder: null,
      storagePct: null,
    };
    const { subject, text } = buildDailyEmail(input);
    try {
      await transport.sendMail({
        from: `IdeaOS <${config.from}>`,
        to: m.email,
        subject,
        text,
        html: buildDailyEmailHtml(input, images),
        attachments: attachments.map((a) => ({ filename: a.filename, content: a.content, cid: a.cid })),
      });
      sent.push(m.email);
    } catch (e) {
      console.error("member email failed", m.email, e);
    }
  }
  return sent;
}

/** 把今天的报告发到他的邮箱。没配、或者今天还没有报告，就不发并说明原因。 */
export async function sendDailyEmail(userId: string, date = tokyoToday()): Promise<SendOutcome> {
  const config = emailConfig();
  if (!config.ready) return { sent: false, reason: `还没配好：缺 ${config.missing.join("、")}` };
  const report = await loadEmailInput(userId, date);
  if (!report) return { sent: false, reason: "今天的报告还没生成" };
  const input: DailyEmailInput = { ...report, ...(await personalParts(userId, date, emailSignalIds(report))) };
  const { subject, text } = buildDailyEmail(input);
  const attachments = await flowCardAttachments(input);
  const html = buildDailyEmailHtml(input, Object.fromEntries(attachments.map((a) => [a.signalId, a.cid])));
  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: { user: config.from, pass: process.env.GMAIL_APP_PASSWORD },
  });
  await transport.sendMail({
    from: `IdeaOS <${config.from}>`,
    to: config.to,
    subject,
    text,
    html,
    attachments: attachments.map((a) => ({ filename: a.filename, content: a.content, cid: a.cid })),
  });
  return { sent: true, to: config.to };
}
