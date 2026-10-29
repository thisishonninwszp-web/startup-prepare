import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve, join } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright-core";
const output = resolve(process.argv[2] ?? ".next/event-verification"); mkdirSync(output, { recursive: true });
const file = (name) => JSON.stringify(resolve(name).replaceAll("\\", "/"));
const entry = `
import React from 'react';import{createRoot}from'react-dom/client';
import{EventPicker}from ${file("app/(app)/signals/events/event-picker.tsx")};
import{EventTimeline}from ${file("app/(app)/signals/events/[eventId]/event-timeline.tsx")};
import{ResearchPanel}from ${file("app/(app)/signals/events/research-panel.tsx")};
import{AIResearchPanel}from ${file("app/(app)/signals/events/ai-research-panel.tsx")};
import{ReplayStart}from ${file("app/(app)/signals/events/replay-start.tsx")};
import{AppShell}from ${file("components/app-shell.tsx")};
import{SignalsNav}from ${file("app/(app)/signals/signals-nav.tsx")};
window.calls={};window.pending={};window.requests=[];window.fixturePath='/signals/events/event';
window.hold=(key,args)=>{window.calls[key]=(window.calls[key]||0)+1;window.requests.push({key,args});return new Promise(resolve=>window.pending[key]=resolve)};
const eventId='11111111-1111-4111-8111-111111111111',signalId='22222222-2222-4222-8222-222222222222',snapshotId='33333333-3333-4333-8333-333333333333';
const source={id:snapshotId,signal_id:signalId,title:'日银政策与企业融资的持续变化',source_url:'https://example.com/news',captured_text:'企业公告明确写道：订单减少，十月暂停扩产。',published_at:null,captured_at:'2026-10-25T01:00:00Z'};
const timeline=[{signalId,snapshotId,title:source.title,sourceName:'公告发布方',sourceUrl:source.source_url,publishedAt:null,capturedAt:source.captured_at,sourceFetchedAt:'2026-10-20T01:00:00Z',capturedText:source.captured_text,captureScope:'excerpt',occurred:null,firstRecordedOpenAt:null,note:null,revision:1}];
window.entries=[{id:'44444444-4444-4444-8444-444444444444',event_id:eventId,subject_id:null,kind:'window',payload:{url:'https://example.com/official',field:'订单',cadence:'manual'},created_at:'2026-10-25T01:00:00Z'}];
const root=createRoot(document.getElementById('root'));window.renderFixture=(empty=false,replay=false)=>root.render(replay?<AppShell><SignalsNav/><p>只有当前揭晓的回放材料</p></AppShell>:empty?<div>暂时离开</div>:<main className="mx-auto max-w-2xl px-4 py-6"><h1 className="mb-5 text-2xl font-semibold">事件档案 · 交互验证</h1><section id="picker"><EventPicker signalId={signalId} defaultTitle="日银政策与企业融资"/></section><section className="mt-6"><EventTimeline eventId={eventId} entries={timeline} mode="published"/></section><ResearchPanel eventId={eventId} entries={window.entries} sources={[source]} available={true} otherEvents={[]}/><div className="mt-6"><ReplayStart eventId={eventId}/></div></main>);
window.renderFixture();
window.renderAI=()=>root.render(<AIResearchPanel eventId={eventId} entries={[{id:'55555555-5555-4555-8555-555555555555',event_id:eventId,subject_id:null,kind:'note',payload:{text:'仅在主动选择时附带的私人理解'},created_at:'2026-10-25T01:00:00Z'}]} sources={[source]} available={true} otherEvents={[]}/>);
`;
const mocks = {
  "next/link": "import React from'react';export default function Link({children,prefetch,...props}){return <a {...props}>{children}</a>}",
  "next/navigation": "export const useRouter=()=>({refresh(){},push(url){window.lastPush=url}});export const usePathname=()=>window.fixturePath;",
  "actions": "export const listEventsAction=async()=>({ok:true,data:{status:'ready',items:[],nextCursor:null}});export const createEventAction=(args)=>window.hold('create',args);export const includeSignalAction=(args)=>window.hold('include',args);export const excludeSignalAction=(args)=>window.hold('exclude',args);export const loadEventHistoryAction=async()=>({ok:true,data:[]});export const loadCandidatesAction=async()=>({ok:true,data:{status:'ready',items:[]}});",
  "research-actions": "export const addResearchAction=(eventId,args)=>window.hold('research',{eventId,...args});export const connectionSourcesAction=async()=>({ok:true,data:[]});",
  "research-ai-actions": "export const generateResearchAction=(eventId,args)=>window.hold('ai',{eventId,...args});",
  "windows-actions": "export const addWindowAction=args=>window.hold('window',args);export const checkWindowAction=args=>window.hold('check',args);",
  "replay-actions": "export const createReplayAction=(...args)=>window.hold('replay',args);",
  "story-preference-buttons": "export const StoryPreferenceButtons=()=>null;",
  "@/lib/supabase/client": "export const createClient=()=>({auth:{signOut:async()=>({})}});",
};
const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, format: "iife", jsx: "automatic", platform: "browser", tsconfig: resolve("tsconfig.json"), define: { "process.env.NODE_ENV": '"development"' }, plugins: [{ name: "fixture-boundaries", setup(b) {
  b.onResolve({ filter: /./ }, (args) => { const key = Object.keys(mocks).find((key) => key === args.path || (!key.includes("/") && args.path.split("/").at(-1) === key)); return key ? { path: key, namespace: "fixture" } : undefined; });
  b.onLoad({ filter: /./, namespace: "fixture" }, (args) => ({ contents: mocks[args.path], loader: "jsx", resolveDir: process.cwd() }));
} }] });
const cssDir = resolve(".next/static/css"); const css = existsSync(cssDir) ? readdirSync(cssDir).filter((name) => name.endsWith(".css")).map((name) => readFileSync(join(cssDir, name), "utf8")).join("\n") : "body{font-family:sans-serif}summary{cursor:pointer}";
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body><div id="root"></div><script src="/app.js"></script></body></html>`;
const server = createServer((req, res) => { res.setHeader("Content-Type", req.url === "/app.js" ? "application/javascript" : "text/html;charset=utf-8"); res.end(req.url === "/app.js" ? bundle.outputFiles[0].text : html); });
await new Promise((done) => server.listen(0, "127.0.0.1", done)); let browser;
try {
  const executablePath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((path) => path && existsSync(path));
  browser = await chromium.launch({ executablePath, headless: true }); const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } }); const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: "networkidle" });
  assert.equal(await page.getByText("发布时间不详", { exact: true }).count() > 0, true); assert.equal(await page.getByText("后补快照", { exact: false }).count() > 0, true);
  async function openPicker() { await page.locator("#picker > details > summary").click(); await page.locator("#picker select").first().selectOption("new"); }
  await openPicker(); await page.locator("#picker").getByRole("button", { name: "确认加入", exact: true }).click(); await page.waitForFunction(() => window.calls.create === 1);
  assert.equal(await page.locator("#picker").getByRole("button", { name: "正在保存……" }).isDisabled(), true);
  await page.evaluate(() => window.pending.create({ ok: true, data: { id: '11111111-1111-4111-8111-111111111111' } })); await page.waitForFunction(() => window.calls.include === 1);
  const request = await page.evaluate(() => window.requests.find((row) => row.key === 'include').args.requestId);
  await page.evaluate(() => window.pending.include({ ok: false, message: '连接中断，响应丢失' })); await page.locator("#picker [role=alert]").waitFor();
  await page.evaluate(() => window.renderFixture(true)); await page.getByText("暂时离开").waitFor(); await page.evaluate(() => window.renderFixture()); await openPicker();
  await page.locator("#picker").getByRole("button", { name: "确认加入", exact: true }).click(); await page.waitForFunction(() => window.calls.create === 2);
  await page.evaluate(() => window.pending.create({ ok: true, data: { id: '11111111-1111-4111-8111-111111111111' } })); await page.waitForFunction(() => window.calls.include === 2);
  assert.equal(await page.evaluate(() => window.requests.filter((row) => row.key === 'include').at(-1).args.requestId), request);
  await page.evaluate(() => window.pending.include({ ok: true, data: { revision: 1 } })); await page.locator("#picker").getByText("已保存。", { exact: false }).waitFor();
  const unknown = page.locator("details").filter({ has: page.locator("summary", { hasText: /^未知清单/ }) }).first(); await unknown.locator(":scope > summary").click();
  await unknown.getByLabel("现在最缺哪块信息").fill("订单减少的客户范围？"); await unknown.getByLabel("看到什么才算回答了").fill("按客户分组的订单数据");
  await unknown.getByRole("button", { name: "加入未知清单" }).click(); await page.waitForFunction(() => window.calls.research === 1); assert.equal(await unknown.getByRole("button", { name: "保存中……" }).isDisabled(), true);
  await page.evaluate(() => window.pending.research({ ok: false, message: '数据库暂不可用' })); await unknown.getByRole("alert").waitFor(); assert.equal(await unknown.getByLabel("现在最缺哪块信息").inputValue(), "订单减少的客户范围？");
  const windowButton = page.getByRole("button", { name: "现在检查并记录：https://example.com/official", exact: true }); await windowButton.click(); assert.equal(await windowButton.isDisabled(), true);
  await page.evaluate(() => window.pending.check({ ok: false, message: '检查失败，未保存新事实' })); await page.getByText("检查失败，未保存新事实", { exact: true }).waitFor();
  await page.getByLabel("截止时间（东京）", { exact: true }).fill("2026-10-20T09:00"); await page.getByRole("checkbox", { name: /我理解这些限制/ }).check(); await page.getByRole("button", { name: "冻结并开始回放" }).click(); await page.waitForFunction(() => window.calls.replay === 1);
  assert.equal(Date.parse(await page.evaluate(() => window.requests.find((row) => row.key === 'replay').args[1])), Date.parse("2026-10-20T09:00:00+09:00")); await page.evaluate(() => window.pending.replay({ ok: false, message: '尚无当时存档，请保留未知' }));
  await page.screenshot({ path: join(output, "events-desktop.png"), fullPage: true }); await page.setViewportSize({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); await page.screenshot({ path: join(output, "events-mobile.png"), fullPage: true });
  await page.evaluate(() => { window.fixturePath = '/signals/events/event/replay/session'; window.renderFixture(false, true); }); await page.getByText("只有当前揭晓的回放材料").waitFor(); assert.equal(await page.getByRole("navigation").count(), 0); assert.equal(await page.locator("a").count(), 1);
  await page.evaluate(() => window.renderAI()); await page.getByRole('region', {name:'AI事件研究'}).waitFor();
  assert.equal(await page.locator('input:checked').count(), 0);
  const generate = page.getByRole('button', {name:'生成待核对草稿'}); assert.equal(await generate.isDisabled(), true);
  await page.getByRole('checkbox', {name:/本事件/}).check();
  const consent = page.getByRole('checkbox', {name:/我同意本次/}); await consent.check(); assert.equal(await generate.isEnabled(), true);
  await page.getByLabel('研究任务').selectOption('unknowns'); assert.equal(await consent.isChecked(), false); assert.equal(await page.locator('input:checked').count(), 0);
  await page.getByRole('checkbox', {name:/本事件/}).check(); await consent.check(); await generate.click(); await page.waitForFunction(()=>window.calls.ai===1);
  assert.deepEqual(await page.evaluate(()=>window.requests.find(r=>r.key==='ai').args.noteIds), []);
  assert.equal(await page.getByRole('button', {name:'正在核对材料……'}).isDisabled(), true);
  await page.evaluate(()=>window.pending.ai({ok:false,message:'供应商暂不可用'})); await page.getByRole('alert').waitFor(); assert.equal(await consent.isChecked(), true);
  assert.deepEqual(errors, []); writeFileSync(join(output, "events-browser-result.json"), JSON.stringify({ passed: true, checks: ["honest times", "busy guards", "navigation retry identity", "preserved draft on failed save", "failed check is not new facts", "Tokyo replay cutoff", "mobile overflow", "replay shell isolation", "AI explicit selection and consent", "AI notes excluded by default", "AI scope resets consent and failure retains selection", "no browser errors"] }, null, 2)); console.log("Event dossiers browser fixture: 12 checks passed.");
} finally { await browser?.close(); await new Promise((done) => server.close(done)); }
