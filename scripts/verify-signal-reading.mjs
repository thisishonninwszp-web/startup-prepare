import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright-core";

// A browser fixture for the actual React components. Server actions are held until
// the test resolves them, so pending states and refresh races are reproducible.
const output = path.resolve(process.argv[2] ?? ".next/reading-verification");
mkdirSync(output, { recursive: true });
const component = (name) => JSON.stringify(path.resolve(`app/(app)/signals/${name}`).replaceAll("\\", "/"));
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReadingProgress, OpenedBadge } from ${component("reading-progress.tsx")};
import { TrackOpen } from ${component("track-open.tsx")};
import { ReportEvidence } from ${component("report-evidence.tsx")};
import { StoryPreferenceButtons } from ${component("story-preference-buttons.tsx")};
import { JudgmentUpdatesPanel } from ${component("judgment-updates-panel.tsx")};
window.requests = {}; window.pending = {};
window.hold = (key) => { window.requests[key] = (window.requests[key] || 0) + 1; return new Promise(resolve => { window.pending[key] = resolve; }); };
window.initial = { available:true, opensAvailable:true, openedIds:[], stoppedIds:null, stoppedAt:null };
const id='11111111-1111-4111-8111-111111111111';
function App({initial}) { return <main className="mx-auto max-w-2xl px-5 py-8">
  <h1 className="mb-6 text-2xl font-semibold">今日外部信号 · 阅读交互验证</h1>
  <ReadingProgress date="2026-10-25" ids={[id]} initial={initial}>
    <details id="news" className="rounded-lg border p-4"><summary className="cursor-pointer"><TrackOpen signalId={id}/> 日银政策的后续报道 <OpenedBadge signalId={id}/></summary>
      <ReportEvidence showBackground={false} item={{background:'不应提前展示的AI背景',grounded:true,basis:['新闻来源明确报道的政策进展。'],url:'https://example.com/news'}}/>
      <details id="analysis" className="mt-3 rounded-md border p-3"><summary className="cursor-pointer">直接展开 AI 整理与推断</summary><p>AI 推断：政策可能影响企业融资，仍需核实。</p></details>
      <StoryPreferenceButtons signalId={id} event="日银政策进展" initial={null}/>
    </details>
    <section className="mt-5 rounded-lg border p-4"><h2>你的原判断：企业融资成本会提高</h2><JudgmentUpdatesPanel judgmentId="original" originalDate="2026-10-24T00:00:00Z"/></section>
  </ReadingProgress>
</main>; }
const root=createRoot(document.getElementById('root'));
window.renderFixture = initial => root.render(<App initial={initial}/>);
window.renderFixture(window.initial);
`;
const mocks = {
  "next/link": "import React from 'react'; export default function Link({children,...props}) { return <a {...props}>{children}</a> }",
  "next/navigation": "export const useRouter=()=>({refresh(){}});",
  "reading-session-actions": "export const recordReadingOpenAction=()=>window.hold('open'); export const stopReadingAction=()=>window.hold('stop');",
  "reading-preferences-actions": "export const setReadingPreferenceAction=()=>window.hold('follow'); export const clearReadingPreferenceAction=()=>window.hold('clear');",
  "judgment-updates-actions": "export const loadJudgmentUpdatesAction=()=>Promise.resolve({ok:true,updates:[]}); export const appendJudgmentUpdateAction=()=>window.hold('update'); export const checkJudgmentEvidenceAction=()=>window.hold('check');",
  "inference-tree": "export const EvidenceList=()=>null;",
};
const bundle = await build({
  stdin: { contents: entry, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, write: false, format: "iife", jsx: "automatic", platform: "browser",
  tsconfig: path.resolve("tsconfig.json"), define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "fixture-actions", setup(builder) {
    builder.onResolve({ filter: /./ }, (args) => {
      const key = Object.keys(mocks).find((name) => args.path === name || args.path === `./${name}`);
      return key ? { path: key, namespace: "fixture" } : undefined;
    });
    builder.onLoad({ filter: /./, namespace: "fixture" }, (args) => ({ contents: mocks[args.path], loader: "jsx", resolveDir: process.cwd() }));
  } }],
});
const cssDir = path.resolve(".next/static/css");
const css = existsSync(cssDir) ? readdirSync(cssDir).filter((name) => name.endsWith(".css")).map((name) => readFileSync(path.join(cssDir, name), "utf8")).join("\n") : "body{font-family:sans-serif}details{margin:1rem}";
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`;
const server = createServer((request, response) => { response.setHeader("Content-Type", request.url === "/app.js" ? "application/javascript" : "text/html; charset=utf-8"); response.end(request.url === "/app.js" ? bundle.outputFiles[0].text : html); });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const executablePath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((value) => value && existsSync(value));
let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: "networkidle" });
  await page.locator("#news > summary").click();
  await page.waitForFunction(() => window.requests.open === 1);
  assert.match(await page.locator("#news > summary").innerText(), /未同步/);
  assert.equal(await page.locator("#analysis").evaluate((node) => node.open), false);
  assert.equal(await page.getByText("新闻来源明确报道的政策进展。", { exact: false }).isVisible(), true);
  await page.evaluate(() => window.renderFixture({ ...window.initial }));
  assert.match(await page.locator("#news > summary").innerText(), /本次已展开/);
  await page.evaluate(() => window.pending.open({ ok: false, message: "offline" }));
  await page.getByRole("status").waitFor();
  await page.locator("#news > summary").click(); await page.locator("#news > summary").click();
  await page.waitForFunction(() => window.requests.open === 2);
  await page.evaluate(() => window.pending.open({ ok: true }));
  await page.waitForFunction(() => !document.querySelector('#news > summary').innerText.includes('未同步'));
  await page.locator("#analysis > summary").click();
  assert.equal(await page.getByText("AI 推断：政策可能影响企业融资，仍需核实。").isVisible(), true);

  await page.getByRole("button", { name: "关注这件事", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "关注这件事", exact: true }).isDisabled(), true);
  assert.equal(await page.evaluate(() => window.requests.follow), 1);
  await page.evaluate(() => window.pending.follow({ ok: true, state: { status: "ready", preferences: [] } }));
  await page.getByRole("button", { name: "查支持与反对证据", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "正在查正反两面的原文…", exact: true }).isDisabled(), true);
  await page.evaluate(() => window.pending.check({ ok: false, message: "支持与反对材料的查询不完整" }));
  await page.getByRole("alert").waitFor();
  await page.getByRole("button", { name: "今天读到这里", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "在保存……", exact: true }).isDisabled(), true);
  await page.evaluate(() => window.pending.stop({ ok: true }));
  await page.getByRole("button", { name: "已保存阅读结束", exact: true }).waitFor();
  await page.evaluate(() => window.renderFixture({ ...window.initial }));
  assert.equal(await page.getByRole("button", { name: "已保存阅读结束", exact: true }).isDisabled(), true);
  await page.screenshot({ path: path.join(output, "reading-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(output, "reading-mobile.png"), fullPage: true });
  assert.deepEqual(errors, []);
  writeFileSync(path.join(output, "reading-browser-result.json"), JSON.stringify({ passed: true, checks: ["source before AI", "default folded analysis", "opened sync failure and retry", "refresh retains local state", "pending follow/evidence/finish", "explicit reading stop", "mobile overflow", "no browser errors"] }, null, 2));
  console.log("Reading browser fixture: 8 checks passed; desktop and mobile screenshots saved.");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
