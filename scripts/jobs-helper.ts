/**
 * 官网填表助手：在你自己的电脑上开着（npm run jobs:helper）。
 * 网页上点了「去填表」的岗位，它几秒内会：打开本机的 Edge → 进到那一页 → 找到应募表单（找不到就点一下
 * 「応募する / Apply」进表单，只进表单、不提交）→ 把能填的填上 → 停在那里等你看、补、自己点「応募する」。
 * 看到提交成功的页面就记成"投了"。
 *
 * 不做的事：不点提交；不碰要登录的页面（读到密码框就停下）；不解验证码（有的话提交时你自己过）；
 * 不勾"同意规约 / 个人信息处理"的框。你的姓名、电话这些值只在这台电脑上填进页面，不发给 AI。
 *
 * 环境变量（.env.local）：JOBS_BROWSER=msedge（默认）或 chrome。
 */
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { mapFormFields } from "@/lib/ai";
import { claimFillRequests, loadFillJob, recordSiteApplication, setFillStatus, MISSING_FILL_MIGRATION } from "@/lib/domains/jobs/fill";
import { CLICK_APPLY, fillFields, HAS_CAPTCHA, markScript, pageText, settle, summary, textual, waitForForm } from "@/lib/domains/jobs/fill-browser";
import { fillValues, looksSubmitted, resumeHtml } from "@/lib/domains/jobs/fill-shared";
import { listJobProfileUsers } from "@/lib/domains/jobs/profile";
import { runBigJobSearch } from "@/lib/domains/jobs/search";
import { tokyoDate } from "@/lib/domains/jobs/shared";
import { bigSearchedOn, markBigSearched } from "./big-search-state";
import { runKanpoFetch } from "./kanpo-run";
import { kanpoFetchedOn, markKanpoFetched } from "./kanpo-state";
import { patchDns } from "./dns-patch";

const POLL_MS = 5_000;
const WATCH_MS = 2_000;
const WAIT_LIMIT_MS = 2 * 60 * 60 * 1000;
const CHANNEL = process.env.JOBS_BROWSER === "chrome" ? "chrome" : "msedge";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- 浏览器 --------------------------------------------------------------------------------

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let pdfBrowser: Browser | null = null;

async function getContext(): Promise<BrowserContext> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ channel: CHANNEL, headless: false, args: ["--start-maximized"] });
    context = await browser.newContext({ viewport: null, locale: "ja-JP" });
  }
  return context!;
}

/** 職務経歴書 PDF：另开一个看不见的浏览器排版（有界面的浏览器存不了 PDF）。 */
async function makePdf(html: string, dir: string, fileName: string): Promise<string> {
  if (!pdfBrowser || !pdfBrowser.isConnected()) pdfBrowser = await chromium.launch({ channel: CHANNEL, headless: true });
  const page = await pdfBrowser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    mkdirSync(dir, { recursive: true });
    const path = join(dir, fileName);
    await page.pdf({ path, format: "A4", preferCSSPageSize: true, printBackground: true });
    return path;
  } finally {
    await page.close();
  }
}


// ---- 填一个岗位 ------------------------------------------------------------------------------

async function handle(job: { id: string; userId: string }): Promise<void> {
  let label = job.id.slice(0, 8);
  const log = (message: string) => console.log(`[${new Date().toLocaleTimeString("ja-JP")}] ${label}：${message}`);
  let page: Page | null = null;
  try {
    const { posting, profile, resume, resumeNote } = await loadFillJob(job.userId, job.id);
    label = `${posting.company_name}「${posting.title}」`;
    if (!posting.url) throw new Error("这个岗位没有网址");
    log("开始填");

    page = await (await getContext()).newPage();
    await page.goto(posting.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await settle(page);

    let found = await waitForForm(page, 4_000);
    if (found.fields.filter(textual).length < 2) {
      const clicked = await page.mainFrame().evaluate(CLICK_APPLY).catch(() => false);
      if (clicked) {
        await settle(page);
        found = await waitForForm(page, 10_000);
      }
    }
    if (found.fields.some((f) => f.type === "password")) {
      throw new Error("这一页要登录或建账号才能应募，助手不碰登录");
    }
    if (found.fields.filter(textual).length < 2) {
      throw new Error("没找到应募表单（可能要先登录，或者表单在别的网站上）");
    }

    const map = await mapFormFields(job.userId, found.fields);
    const values = fillValues(profile, resume);
    let pdfPath: string | null = null;
    if (resume && Array.from(map.values()).includes("resume_pdf")) {
      const name = profile.personal.name.replace(/[\s　]+/g, "") || "応募者";
      pdfPath = await makePdf(
        resumeHtml({ personal: profile.personal, resume, date: tokyoDate() }),
        join(tmpdir(), "ideaos-jobs", job.id),
        `職務経歴書_${name.replace(/[\\/:*?"<>|]/g, "")}.pdf`
      );
    }
    const report = await fillFields(found.frame, found.fields, map, values, pdfPath);
    const extra: string[] = [];
    if (resumeNote) extra.push(resumeNote + "。");
    if (await found.frame.evaluate(HAS_CAPTCHA).catch(() => false)) extra.push("这一页有验证码，提交的时候你自己过。");
    const message = summary(report, extra);
    await found.frame.evaluate(markScript(report.todo.map((t) => t.index), report.consent.map((c) => c.index), message)).catch(() => undefined);
    await setFillStatus(job.id, "waiting", message.split("\n").slice(0, 3).join(" "));
    log(`填好了 ${report.filled} 格，等你看完自己点「応募する」`);

    const startUrl = page.url();
    const startText = await pageText(page);
    const deadline = Date.now() + WAIT_LIMIT_MS;
    while (Date.now() < deadline) {
      await sleep(WATCH_MS);
      if (page.isClosed()) {
        await setFillStatus(job.id, "failed", "你关掉了页面，没提交");
        log("页面关掉了，没提交");
        return;
      }
      if (looksSubmitted({ startUrl, startText, url: page.url(), text: await pageText(page) })) {
        await recordSiteApplication(job.userId, job.id, resume?.id ?? null);
        await setFillStatus(job.id, "done", "看到提交成功的页面，记成了「投了」");
        log("提交成功，记成「投了」");
        return;
      }
    }
    await setFillStatus(job.id, "failed", "两个小时没提交，标回没填成");
    log("两个小时没提交");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log(`没填成：${message}`);
    await setFillStatus(job.id, "failed", message.slice(0, 300)).catch(() => undefined);
  }
}

// ---- 每天的大搜 ------------------------------------------------------------------------------

// 网页上的快搜不算大搜：它每类只搜一个说法、最多留 8 条
let bigSearching = false;
let kanpoFetching = false;

/** 助手开着时每天第一次自动大搜一轮（在后台跑，不挡着填表）。 */
async function maybeBigSearch(): Promise<void> {
  if (bigSearching) return;
  const today = tokyoDate();
  if (bigSearchedOn() === today) return;
  bigSearching = true;
  try {
    console.log("今天还没大搜，开始搜岗位（几分钟，不挡着填表）……");
    for (const userId of await listJobProfileUsers()) {
      const r = await runBigJobSearch(userId, today);
      console.log(`今天的大搜：读了 ${r.read} 个岗位，新留下 ${r.kept} 条${r.skipped.length ? `（${r.skipped.join("；")}）` : ""}。去 /jobs 的「今天搜到的」看。`);
    }
    markBigSearched(today);
  } catch (e) {
    console.error(`大搜没搜成：${e instanceof Error ? e.message : String(e)}（过一会儿会再试）`);
  } finally {
    bigSearching = false;
  }
}

/** 助手开着时每天第一次顺手抓一次官报（在后台跑，不挡着填表；第一次要补 90 天，会跑一阵子）。 */
async function maybeKanpo(): Promise<void> {
  if (kanpoFetching) return;
  const today = tokyoDate();
  if (kanpoFetchedOn() === today) return;
  kanpoFetching = true;
  try {
    console.log("今天还没抓官报，开始抓会社決算公告（不挡着填表）……");
    const r = await runKanpoFetch({}, (line) => console.log(`官报 ${line}`));
    markKanpoFetched(today);
    if (r.days > 0) console.log(`官报抓完了：${r.days} 天，决算公告 ${r.notices} 条。去 /signals/kanpo 看。`);
  } catch (e) {
    console.error(`官报没抓成：${e instanceof Error ? e.message : String(e)}（过一会儿会再试）`);
  } finally {
    kanpoFetching = false;
  }
}

async function main(): Promise<void> {
  patchDns();
  console.log(`填表助手开着（用 ${CHANNEL === "chrome" ? "Chrome" : "Edge"}）。网页上点「去填表」的岗位，几秒内会在这里打开。Ctrl+C 退出。`);
  const active = new Set<string>();
  let lastError = "";
  const stop = async () => {
    for (const id of Array.from(active)) await setFillStatus(id, "failed", "填表助手关掉了").catch(() => undefined);
    await browser?.close().catch(() => undefined);
    await pdfBrowser?.close().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", () => void stop());

  for (;;) {
    void maybeBigSearch();
    void maybeKanpo();
    try {
      for (const job of await claimFillRequests()) {
        if (active.has(job.id)) continue;
        active.add(job.id);
        void handle(job).finally(() => active.delete(job.id));
      }
      lastError = "";
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message !== lastError) console.error(message === MISSING_FILL_MIGRATION ? message : `取任务出错：${message}`);
      lastError = message;
    }
    await sleep(POLL_MS);
  }
}

void main();
