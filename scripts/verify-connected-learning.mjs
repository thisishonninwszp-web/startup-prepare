import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve, join } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright-core";

const output = resolve(process.argv[2] ?? ".next/connected-verification"); mkdirSync(output, { recursive: true });
const file = path => JSON.stringify(resolve(path).replaceAll("\\", "/"));
const entry = `
import React from 'react';import{createRoot}from'react-dom/client';
import{ExperimentPanel}from ${file("app/(app)/ideas/[id]/experiment-panel.tsx")};
import{SearchImportPanel}from ${file("app/(app)/workbench/search-import-panel.tsx")};
import{ConnectedForm,Field}from ${file("app/(app)/workbench/connected-form.tsx")};
window.calls=[];window.pending={};window.hold=(kind,args)=>{window.calls.push({kind,args});return new Promise(resolve=>window.pending[kind]=resolve)};
const idea='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',sample='33333333-3333-4333-8333-333333333333';
window.experiment={id,user_id:idea,idea_id:idea,gap_id:'66666666-6666-4666-8666-666666666666',series_id:id,revision:1,objective:'delivery',route:'prototype_test',access_context:{publicSources:false,canRunPrototype:true,canPublishExample:false,canContactPeople:false},question:'公开规则下能否正确处理入住问题',hypothesis_snapshot:{},gap_snapshot:null,input_plan:{scope:'合成问题'},steps:['手动运行原型并检查原文'],pass_criterion:'没有编造规定',fail_criterion:'编造费用',limits:'不能说明客户需求',time_budget_minutes:null,cost_budget_minor:null,currency:null,deferred_questions:['经营者实际如何处理'],recheck_on:null,created_at:'2026-10-26T01:00:00Z'};
window.sample={id:sample,experiment_id:id,input_origin:'synthetic',input_text:'凌晨到店如何处理',source_snapshot:null,expected_output:'缺少规则时明确未知',created_at:'2026-10-26T01:00:00Z'};
window.data={experiments:[window.experiment],cases:[window.sample],runs:[],results:[],hasMore:false};
const root=createRoot(document.getElementById('root'));
root.render(<main className="mx-auto max-w-2xl space-y-6 px-4 py-6"><h1>决策联动 · 合成数据验收</h1><div id="experiment"><ExperimentPanel ideaId={idea}/></div><section id="search"><SearchImportPanel taskId={id} versionId={sample} configuredTerms={["a"]} context={{region:'JP',language:'ja',timeframe:'2026-01'}} onSaved={async()=>{}}/></section><section id="refresh"><ConnectedForm operation="refresh-fixture" submit={async(d,requestId)=>window.hold('form',{text:d.get('text'),requestId})} label="保存刷新夹具" onSaved={async()=>{throw new Error('refresh failed')}}><Field name="text" label="保留的输入"/></ConnectedForm></section></main>);
`;
const mocks = {
  "experiment-actions": "export const loadExperimentsAction=async()=>({ok:true,data:structuredClone(window.data)});export const saveExperimentVersionAction=args=>window.hold('version',args);export const appendExperimentCaseAction=args=>window.hold('case',args);export const startExperimentRunAction=args=>window.hold('start',args);export const completeExperimentRunAction=args=>window.hold('complete',args);export const attachExperimentGapRefAction=args=>window.hold('attach',args);",
  "search-observation-actions": "export const saveSearchObservationRun=args=>window.hold('search',args);",
};
const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, format: "iife", jsx: "automatic", platform: "browser", tsconfig: resolve("tsconfig.json"), define: { "process.env.NODE_ENV": '"development"' }, plugins: [{ name: "fixture-boundaries", setup(b) {
  b.onResolve({ filter: /./ }, args => { const key = Object.keys(mocks).find(k => args.path.split("/").at(-1) === k); return key ? { path: key, namespace: "fixture" } : undefined; });
  b.onLoad({ filter: /./, namespace: "fixture" }, args => ({ contents: mocks[args.path], loader: "jsx", resolveDir: process.cwd() }));
} }] });
const cssDir = resolve(".next/static/css"); const css = existsSync(cssDir) ? readdirSync(cssDir).filter(n => n.endsWith(".css")).map(n => readFileSync(join(cssDir,n),"utf8")).join("\n") : "body{font-family:sans-serif}";
const server = createServer((req,res) => { res.setHeader("Content-Type", req.url === "/app.js" ? "application/javascript" : "text/html;charset=utf-8"); res.end(req.url === "/app.js" ? bundle.outputFiles[0].text : `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/app.js"></script></html>`); });
await new Promise(done => server.listen(0,"127.0.0.1",done)); let browser;
try {
  const executablePath = [process.env.CHROME_PATH,"C:/Program Files/Google/Chrome/Application/chrome.exe","C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(p=>p&&existsSync(p));
  browser = await chromium.launch({executablePath,headless:true});const page=await browser.newPage({viewport:{width:1100,height:900}});const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:"networkidle"});
  const exp=page.locator('#experiment');await exp.getByRole('button',{name:/暂时接触不到人/}).click();await exp.getByText('公开规则下能否正确处理入住问题 · v1',{exact:true}).waitFor();
  const create=exp.locator('details').filter({has:page.locator('summary',{hasText:'建立一张新的实验卡'})}).first();await create.locator('summary').click();
  assert.equal(await create.getByLabel('选择这次入口').inputValue(),'deferred_contact');await create.getByLabel('能手动运行原型',{exact:true}).check();await create.getByLabel('选择这次入口').selectOption('prototype_test');
  await create.getByLabel('需要被反驳或回答的问题',{exact:false}).fill('测试输入会不会编造规则');await create.getByLabel('输入范围和允许的来源',{exact:false}).fill('合成输入');
  await create.getByLabel('具体执行步骤 / 暂缓时如何复查（每行一步）',{exact:false}).fill('手动运行');await create.getByLabel('运行前写：什么算符合本项测试判据',{exact:false}).fill('未知时承认未知');await create.getByLabel('什么会推翻前提 / 不符合判据',{exact:false}).fill('编造信息');await create.getByLabel('这项测试不能回答什么',{exact:false}).fill('客户需求');
  await create.getByRole('button',{name:'保存实验卡',exact:true}).click();await page.waitForFunction(()=>window.calls.some(c=>c.kind==='version'));assert.equal(await create.getByRole('button',{name:'正在保存……'}).isDisabled(),true);
  await page.evaluate(()=>window.pending.version({ok:false,message:'模拟网络失败'}));await create.getByText('模拟网络失败').waitFor();assert.equal(await create.getByLabel('需要被反驳或回答的问题',{exact:false}).inputValue(),'测试输入会不会编造规则');
  await create.locator('summary').click();await exp.getByRole('button',{name:'开始新运行并冻结当前样本'}).click();await page.waitForFunction(()=>window.calls.some(c=>c.kind==='start'));
  await page.evaluate(()=>{window.run={id:'44444444-4444-4444-8444-444444444444',experiment_id:window.experiment.id,case_manifest:[window.sample.id],status:'running',started_at:'2026-10-26T02:00:00Z',finished_at:null,actual_minutes:null,actual_cost_minor:null,currency:null,output_artifact:null};window.data.runs=[window.run];window.pending.start({ok:true,id:window.run.id})});
  await exp.getByText('正在运行（样本已冻结）',{exact:false}).waitFor();await exp.getByLabel('执行 / 反馈上下文',{exact:true}).selectOption('ai_simulation');await exp.getByLabel('按原先判据逐项记录',{exact:true}).selectOption('pass');await exp.getByLabel('实际输出（无法判定也写原因）',{exact:false}).fill('承认规则未知');await exp.getByRole('button',{name:'按冻结样本保存全部结果'}).click();await page.waitForFunction(()=>window.calls.some(c=>c.kind==='complete'));
  const manifest=await page.evaluate(()=>window.calls.find(c=>c.kind==='complete').args.results);assert.equal(manifest.length,1);assert.equal(manifest[0].executionContext,'ai_simulation');
  await page.evaluate(()=>{window.run={...window.run,status:'completed',finished_at:'2026-10-26T02:05:00Z'};window.data.runs=[window.run];window.data.results=[{id:'55555555-5555-4555-8555-555555555555',run_id:window.run.id,case_id:window.sample.id,execution_context:'ai_simulation',outcome:'pass',actual_output:{text:'承认规则未知'},manual_intervention:'',notes:''}];window.pending.complete({ok:true,id:window.run.id})});
  await exp.getByText('已完成本次运行',{exact:false}).waitFor();assert.equal(await exp.getByText('真实任务适用性、痛点和付费仍未知',{exact:true}).count(),1);await exp.getByRole('button',{name:'确认追加运行引用到原缺口'}).click();await page.waitForFunction(()=>window.calls.some(c=>c.kind==='attach'));await page.evaluate(()=>window.pending.attach({ok:true,id:'gap'}));
  const search=page.locator('#search');await search.locator('summary').click();const raw=search.getByLabel('或者粘贴原始 CSV / TSV');await raw.fill('Week,a\ninvalid,5');await search.getByRole('button',{name:'解析并预览'}).click();assert.equal(await search.getByRole('button',{name:'确认保存导入'}).isDisabled(),true);
  await raw.fill('Week,a: (Japan),b\n2026-01-04,0,<1');await search.getByRole('button',{name:'解析并预览'}).click();await search.getByLabel('对应词组：a: (Japan)',{exact:true}).selectOption('a');await search.getByRole('button',{name:'确认保存导入'}).click();await page.waitForFunction(()=>window.calls.some(c=>c.kind==='search'));assert.deepEqual(await page.evaluate(()=>window.calls.find(c=>c.kind==='search').args.termMappings),{'a: (Japan)':'a'});const first=await page.evaluate(()=>window.calls.find(c=>c.kind==='search').args.requestId);await page.evaluate(()=>window.pending.search(Promise.reject(new Error('网络失败'))));await search.getByText(/原始输入与请求身份已保留/).waitFor();assert.equal(await raw.inputValue(),'Week,a: (Japan),b\n2026-01-04,0,<1');
  await search.getByRole('button',{name:'确认保存导入'}).click();await page.waitForFunction(()=>window.calls.filter(c=>c.kind==='search').length===2);assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.kind==='search').at(-1).args.requestId),first);await page.evaluate(()=>window.pending.search({id:'saved'}));await search.getByText('已保存原始导出与解析结果。',{exact:true}).waitFor();
  const refresh=page.locator('#refresh');await refresh.getByLabel('保留的输入').fill('已入库但刷新失败');await refresh.getByRole('button',{name:'保存刷新夹具'}).click();await page.waitForFunction(()=>window.calls.some(c=>c.kind==='form'));await page.evaluate(()=>window.pending.form({ok:true}));await refresh.getByText(/已保存.*刷新/).waitFor();
  await page.screenshot({path:join(output,'connected-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:join(output,'connected-mobile.png'),fullPage:true});assert.deepEqual(errors,[]);
  writeFileSync(join(output,'connected-browser-result.json'),JSON.stringify({passed:true,checks:['resource-based routes','predeclared criteria retained on failure','busy guards','frozen manifest result','synthetic/AI boundaries','explicit gap attachment','invalid CSV blocked','search retry identity','explicit provider label mapping','save vs refresh failure','mobile overflow','no browser errors']},null,2));console.log('Connected learning browser fixture: 12 checks passed.');
} catch(error) {
  const pages = browser?.contexts().flatMap(c=>c.pages()) ?? [];
  if(pages[0]) {writeFileSync(join(output,'connected-failure.html'),await pages[0].content());await pages[0].screenshot({path:join(output,'connected-failure.png'),fullPage:true});}
  throw error;
} finally {await browser?.close();await new Promise(done=>server.close(done));}
