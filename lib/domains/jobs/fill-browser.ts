import type { Frame, Page } from "playwright-core";
import { fitsMaxLength, isConsentField, pickOption, type FillKey, type FormField, type TextFillKey } from "./fill-shared";

/**
 * 官网填表助手在浏览器里做的事：读格子、找应募入口、填、标黄、读页面文字。
 * 只给 scripts/jobs-helper.ts 用（本机跑，playwright-core 驱动本机的 Edge）；网页那边不引这个文件。
 * 不点提交、不勾同意框、不碰密码框。
 */

// ---- 在页面里跑的脚本（写成字符串：tsx 编译出来的函数会带 __name，传进浏览器会报错）-------------------

/** 读出页面上每一格，给每格打上 data-ideaos-field 记号。 */
export const COLLECT_FIELDS = `(() => {
  const clean = (t) => (t || "").replace(/\\s+/g, " ").trim();
  const textWithoutFields = (node) => {
    const copy = node.cloneNode(true);
    copy.querySelectorAll("input,textarea,select,option,script,style,button").forEach((n) => n.remove());
    return clean(copy.textContent);
  };
  const labelOf = (el) => {
    const parts = [];
    if (el.labels && el.labels.length) parts.push(Array.from(el.labels).map((l) => textWithoutFields(l)).join(" "));
    const aria = el.getAttribute("aria-label");
    if (aria) parts.push(aria);
    const by = el.getAttribute("aria-labelledby");
    if (by) parts.push(by.split(/\\s+/).map((id) => (document.getElementById(id) || {}).textContent || "").join(" "));
    if (!clean(parts.join(" "))) {
      // 往上找最近的说明字（<th>/<dt> 这种在旁边的也算）；碰到装着别的格子的容器就停，免得把整张表单的字当成名字
      const fieldCount = (node) => node.querySelectorAll("input:not([type=hidden]), textarea, select").length;
      const isField = (node) => node.matches("input, textarea, select");
      let node = el.parentElement;
      for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
        if (fieldCount(node) > 1) break;
        const own = textWithoutFields(node);
        if (own && own.length <= 80) { parts.push(own); break; }
        const prev = node.previousElementSibling;
        if (prev && !isField(prev) && fieldCount(prev) === 0) {
          const prevText = textWithoutFields(prev);
          if (prevText && prevText.length <= 80) { parts.push(prevText); break; }
        }
      }
    }
    const hint = [el.getAttribute("placeholder"), el.getAttribute("name")].filter(Boolean).join(" / ");
    return clean(parts.join(" ")).slice(0, 120) + (hint ? " [" + hint.slice(0, 60) + "]" : "");
  };
  const visible = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
  };
  const skipTypes = ["hidden", "submit", "button", "image", "reset", "search"];
  const out = [];
  let index = 0;
  for (const el of Array.from(document.querySelectorAll("input, textarea, select"))) {
    const tag = el.tagName.toLowerCase();
    const type = tag === "input" ? (el.getAttribute("type") || "text").toLowerCase() : tag;
    if (skipTypes.includes(type) || el.disabled) continue;
    // 上传框常常藏起来、外面套一个自己的按钮，所以文件框不看是不是可见
    if (type !== "file" && !visible(el)) continue;
    const kind = type === "file" ? "file" : type === "checkbox" ? "checkbox" : type === "radio" ? "radio" : tag === "textarea" ? "textarea" : tag === "select" ? "select" : "text";
    el.setAttribute("data-ideaos-field", String(index));
    const label = labelOf(el);
    out.push({
      index,
      kind,
      type,
      label,
      required: !!el.required || el.getAttribute("aria-required") === "true" || /必須|\\*/.test(label),
      maxLength: typeof el.maxLength === "number" && el.maxLength > 0 ? el.maxLength : null,
      options: tag === "select" ? Array.from(el.options).map((o) => clean(o.text)) : [],
    });
    index += 1;
  }
  return out;
})()`;

/** 找「応募する / エントリー / Apply」并点进去（只进表单）。点之前把新标签页改成本页打开。 */
export const CLICK_APPLY = `(() => {
  const re = /^(この求人に)?(応募する|応募フォーム|応募はこちら|今すぐ応募|エントリーする|エントリー|apply( for this job| now)?)$/i;
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  for (const el of Array.from(document.querySelectorAll("a, button, [role=button]"))) {
    const text = (el.textContent || "").replace(/\\s+/g, " ").trim();
    if (!re.test(text) || !visible(el)) continue;
    if (el.closest("form") && (el.getAttribute("type") || "submit") === "submit" && el.tagName === "BUTTON") continue;
    if (el.tagName === "A") el.setAttribute("target", "_self");
    el.click();
    return true;
  }
  return false;
})()`;

export const HAS_CAPTCHA = `(() => !!document.querySelector('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="turnstile"], .g-recaptcha, .h-captcha, [data-sitekey]'))()`;

export const BODY_TEXT = `(() => (document.body ? document.body.innerText.slice(0, 20000) : ""))()`;

/** 标黄要他补的格子、标橙同意框，页面顶上加一条说明。说明用 textContent，不拼 HTML。 */
export function markScript(todo: number[], consent: number[], message: string): string {
  return `(() => {
    for (const i of ${JSON.stringify(todo)}) { const el = document.querySelector('[data-ideaos-field="' + i + '"]'); if (el) { el.style.outline = "3px solid #f5b400"; el.style.outlineOffset = "2px"; } }
    for (const i of ${JSON.stringify(consent)}) { const el = document.querySelector('[data-ideaos-field="' + i + '"]'); if (el) { el.style.outline = "3px solid #e8590c"; el.style.outlineOffset = "2px"; } }
    let bar = document.getElementById("ideaos-fill-bar");
    if (!bar) { bar = document.createElement("div"); bar.id = "ideaos-fill-bar"; document.body.prepend(bar); }
    bar.style.cssText = "position:sticky;top:0;z-index:2147483647;background:#fff8db;color:#3b2f00;border-bottom:2px solid #f5b400;padding:10px 14px;font:14px/1.6 sans-serif;white-space:pre-line";
    bar.textContent = ${JSON.stringify(message)};
  })()`;
}

/** 表单可能在 iframe 里（Greenhouse 嵌在公司官网上）：挑格子最多的那一层。 */
export async function pickFormFrame(page: Page): Promise<{ frame: Frame; fields: FormField[] }> {
  let best: { frame: Frame; fields: FormField[] } = { frame: page.mainFrame(), fields: [] };
  for (const frame of page.frames()) {
    const fields = (await frame.evaluate(COLLECT_FIELDS).catch(() => [])) as FormField[];
    if (fields.length > best.fields.length) best = { frame, fields };
  }
  return { frame: best.frame, fields: best.fields };
}

export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
}

export async function pageText(page: Page): Promise<string> {
  const texts = await Promise.all(page.frames().map((f) => f.evaluate(BODY_TEXT).catch(() => "")));
  return (texts as string[]).join("\n");
}

export const textual = (f: FormField) => f.kind === "text" || f.kind === "textarea" || f.kind === "select";

export type Report = { filled: number; todo: { index: number; label: string; reason: string }[]; consent: { index: number; label: string }[] };

export async function fillFields(
  frame: Frame,
  fields: FormField[],
  map: Map<number, FillKey>,
  values: Record<TextFillKey, string>,
  pdfPath: string | null
): Promise<Report> {
  const report: Report = { filled: 0, todo: [], consent: [] };
  for (const field of fields) {
    if (isConsentField(field)) {
      report.consent.push({ index: field.index, label: field.label });
      continue;
    }
    const key = map.get(field.index);
    const locator = frame.locator(`[data-ideaos-field="${field.index}"]`);
    const todo = (reason: string) => report.todo.push({ index: field.index, label: field.label, reason });
    if (!key) {
      if (field.required) todo("这家特有的问题");
      continue;
    }
    try {
      if (key === "resume_pdf") {
        if (!pdfPath) {
          todo("还没有这家的简历，传不了 PDF");
          continue;
        }
        await locator.setInputFiles(pdfPath);
        report.filled += 1;
        continue;
      }
      let value = values[key];
      if (!value) {
        todo("条件页或简历里没有这一样");
        continue;
      }
      if (field.kind === "select") {
        const option = pickOption(field.options, value);
        if (option === null) {
          todo("下拉框里挑不出对应的选项");
          continue;
        }
        await locator.selectOption({ index: option });
        report.filled += 1;
        continue;
      }
      if (field.type === "number") {
        // 年收这种数字格：格子名字里写着"万"才填数字，单位看不出来就不填
        if (!/万/.test(field.label)) {
          todo("格子要的单位看不出来");
          continue;
        }
        value = value.replace(/[^\d]/g, "");
      }
      if (!fitsMaxLength(value, field.maxLength)) {
        todo(`超了 ${value.length - (field.maxLength ?? 0)} 字（上限 ${field.maxLength} 字）`);
        continue;
      }
      await locator.fill(value);
      report.filled += 1;
    } catch {
      todo("这一格填不进去");
    }
  }
  return report;
}

export function summary(report: Report, extra: string[]): string {
  const lines = [`IdeaOS 填表助手：填了 ${report.filled} 格。看一遍，补上黄色的格子，最后自己点「応募する」。`];
  // 格子名字后面方括号里是给 AI 看的 placeholder / name，给人看时去掉
  const name = (label: string) => label.replace(/\s*\[[^\]]*\]$/, "").trim() || "（没名字的格子）";
  if (report.todo.length) lines.push(`要你补的（黄色）：${report.todo.map((t) => `${name(t.label)}——${t.reason}`).join("；")}`);
  if (report.consent.length) lines.push(`同意规约 / 个人信息的框（橙色）没替你勾，看过再自己勾。`);
  lines.push(...extra);
  return lines.join("\n");
}

