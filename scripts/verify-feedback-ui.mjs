import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve, join } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright-core";

const output = resolve(process.argv[2] || ".next/feedback-ui-verification");
mkdirSync(output, { recursive: true });
const file = path => JSON.stringify(resolve(path).replaceAll("\\", "/"));
const entry = `
import React from 'react';import{createRoot}from'react-dom/client';
import{FeedbackImpactPanel}from ${file("app/(app)/workbench/feedback-impact-panel.tsx")};
import{ReconsiderationPanel}from ${file("app/(app)/ideas/[id]/reconsideration-panel.tsx")};
import{ReconsiderationCuesPanel}from ${file("app/(app)/workbench/reconsideration-cues-panel.tsx")};
window.idea='11111111-1111-4111-8111-111111111111';window.target='22222222-2222-4222-8222-222222222222';
window.calls=[];window.pending={};window.hold=(kind,args)=>{window.calls.push({kind,args});return new Promise(resolve=>window.pending[kind]=resolve)};
window.feedback={status:'ready',items:[],links:[],nextBefore:null};window.conditions={status:'ready',items:[],currentVersion:null,nextCursor:null};window.cues={status:'ready',items:[{id:'88888888-8888-4888-8888-888888888888',idea_id:window.idea,condition_version_id:'77777777-7777-4777-8777-777777777777',kind:'cue',revision:3}],nextCursor:null};
createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-2xl space-y-6 px-4 py-6"><h1>反馈联动 · 合成夹具验收</h1><div id="feedback"><FeedbackImpactPanel ideaId={window.idea}/></div><div id="conditions"><ReconsiderationPanel ideaId={window.idea} archived/></div><div id="cues"><ReconsiderationCuesPanel initialData={window.cues}/></div></main>);
`;
const mocks = {
  "next/link": "import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}",
  "feedback-actions": `export const loadFeedbackAction=async()=>{window.calls.push({kind:'loadFeedback'});if(window.readFails)throw new Error('database-secret');return{ok:true,data:structuredClone(window.feedback)}};export const saveFeedbackAction=a=>window.hold('capture',a);export const saveFeedbackLinkAction=a=>window.hold('link',a);export const searchFeedbackIdeasAction=async()=>({ok:true,data:{items:[{id:window.target,title:'另一个旅馆想法',status:'假设'}],nextCursor:null}});export const loadFeedbackValidationsAction=async()=>({ok:true,data:{items:[{id:'33333333-3333-4333-8333-333333333333',note:'用户记下的验证备注',has_pain:'yes',will_pay:'unsure',contacted_at:'2026-10-26'}],nextCursor:null}});export const loadFeedbackLinksAction=async()=>({ok:true,data:{status:'ready',items:structuredClone(window.feedback.links),nextBefore:null}});`,
  "reconsideration-actions": `export const loadReconsiderationAction=async()=>({ok:true,data:structuredClone(window.conditions)});export const saveReconsiderationConditionAction=a=>window.hold('condition',a);export const evaluateReconsiderationAction=a=>window.hold('evaluate',a);export const retractReconsiderationConditionAction=a=>window.hold('retractCondition',a);export const acknowledgeReconsiderationAction=a=>window.hold('ack',a);export const loadReconsiderationCuesAction=async()=>({ok:true,data:structuredClone(window.cues)});`,
  "feedback-task-panel": "export const FeedbackTaskPanel=()=>null;",
};
const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, format: "iife", jsx: "automatic", platform: "browser", tsconfig: resolve("tsconfig.json"), define: { "process.env.NODE_ENV": '"development"' }, plugins: [{ name: "feedback-fixture", setup(b) {
  b.onResolve({ filter: /./ }, args => { const key = Object.keys(mocks).find(k => args.path === k || args.path.split("/").at(-1) === k); return key ? { path: key, namespace: "fixture" } : undefined; });
  b.onLoad({ filter: /./, namespace: "fixture" }, args => ({ contents: mocks[args.path], loader: "jsx", resolveDir: process.cwd() }));
} }] });
const cssDir = resolve(".next/static/css");
const css = existsSync(cssDir) ? readdirSync(cssDir).filter(n => n.endsWith(".css")).map(n => readFileSync(join(cssDir,n),"utf8")).join("\n") : "body{font-family:sans-serif}*{box-sizing:border-box}input,textarea,select{max-width:100%}";
const server = createServer((req,res) => { res.setHeader("Content-Type", req.url === "/app.js" ? "application/javascript" : "text/html;charset=utf-8"); res.end(req.url === "/app.js" ? bundle.outputFiles[0].text : `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/app.js"></script></html>`); });
await new Promise(done => server.listen(0,"127.0.0.1",done));
let browser;
try {
  const executablePath = [process.env.CHROME_PATH,"C:/Program Files/Google/Chrome/Application/chrome.exe","C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(p=>p&&existsSync(p));
  browser = await chromium.launch({ executablePath, headless:true });
  const page = await browser.newPage({viewport:{width:1100,height:900}}), errors=[];
  page.setDefaultTimeout(10000);page.on("pageerror",e=>{errors.push(e.message);console.error("Browser error:",e.message)});
  await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:"networkidle"});
  assert.equal(await page.evaluate(()=>window.calls.length),0,"private feedback remains unloaded initially");
  const feedback=page.locator('#feedback');
  await feedback.getByRole('button',{name:/反馈与适用范围/}).click();
  await feedback.getByText('记录接触 / 引用既有验证',{exact:true}).click();
  await feedback.getByLabel('原话 / 接触笔记').fill('夜里客人到店时才需要协助');
  await feedback.getByLabel('我确认以上是逐字原话').check();
  await feedback.getByLabel('对方角色与接触情境').fill('小旅馆经营者，夜间接待');
  await feedback.getByLabel('我的解释（与原始记录分开）').fill('先查夜间异常，不外推到整个行业');
  await feedback.getByRole('button',{name:'保存反馈记录',exact:true}).click();
  await page.waitForFunction(()=>window.calls.some(c=>c.kind==='capture'));
  const first=await page.evaluate(()=>window.calls.find(c=>c.kind==='capture').args);
  assert.equal(first.sourceNote,'夜里客人到店时才需要协助');assert.equal(first.verbatim,true);assert.notEqual(first.sourceNote,first.interpretation);assert.equal(first.contactedAt,null);
  assert.equal(await feedback.getByRole('button',{name:'正在保存……'}).isDisabled(),true);
  await page.evaluate(()=>window.pending.capture({ok:false,message:'database-secret'}));
  await feedback.getByText('反馈未保存，请检查输入后重试。',{exact:true}).waitFor();
  assert.equal(await feedback.getByLabel('原话 / 接触笔记').inputValue(),first.sourceNote);
  assert.equal(await page.getByText('database-secret').count(),0);
  await feedback.getByRole('button',{name:'保存反馈记录',exact:true}).click();
  await page.waitForFunction(()=>window.calls.filter(c=>c.kind==='capture').length===2);
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.kind==='capture').at(-1).args.requestId),first.requestId);
  await page.evaluate(()=>{const a=window.calls.filter(c=>c.kind==='capture').at(-1).args;window.feedback.items=[{id:'44444444-4444-4444-8444-444444444444',idea_id:window.idea,user_id:window.idea,revision:1,source_kind:a.sourceKind,source_note:a.sourceNote,verbatim:a.verbatim,role_context:a.roleContext,interpretation:a.interpretation,created_at:'2026-10-27T00:00:00Z'}];window.pending.capture({ok:true,id:window.feedback.items[0].id})});
  await feedback.getByText('2026-10-27 · 小旅馆经营者，夜间接待',{exact:false}).click();
  await feedback.getByText('客户逐字原话（用户声明）',{exact:true}).waitFor();
  assert.equal(await feedback.getByRole('link',{name:'带上反馈准备接触 →'}).getAttribute('href'),'/outreach/new?use_case=startup&feedback_id=44444444-4444-4444-8444-444444444444');
  await feedback.getByText('确认适用于另一个想法',{exact:true}).click();
  await feedback.getByRole('button',{name:'查找 / 查看全部'}).click();
  await feedback.getByRole('button',{name:'另一个旅馆想法'}).click();
  for(const [label,text] of [['要复查的假设','夜间异常是否无人处理'],['适用群体与情境','同城市小旅馆'],['局限与不适用情境','大型连锁不适用'],['反例 / 仍未知的部分','值班人员可能已处理']])await feedback.getByLabel(label,{exact:false}).fill(text);
  await feedback.getByRole('button',{name:'确认适用范围',exact:true}).click();
  await page.waitForFunction(()=>window.calls.some(c=>c.kind==='link'));
  assert.equal(await page.evaluate(()=>window.calls.find(c=>c.kind==='link').args.expectedLinkId),null);
  await page.evaluate(()=>{const a=window.calls.find(c=>c.kind==='link').args;window.feedback.links=[{id:'55555555-5555-4555-8555-555555555555',feedback_id:a.feedbackId,target_idea_id:a.targetIdeaId,revision:2,action:a.action,assumption:a.assumption,scope:a.scope,limits:a.limits,unknown:a.unknown}];window.pending.link({ok:true,id:window.feedback.links[0].id})});
  await feedback.getByRole('button',{name:'撤回此适用关系'}).click();
  await page.waitForFunction(()=>window.calls.filter(c=>c.kind==='link').length===2);
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.kind==='link').at(-1).args.expectedLinkId),'55555555-5555-4555-8555-555555555555');
  await page.evaluate(()=>{window.feedback.links=[{...window.feedback.links[0],id:'66666666-6666-4666-8666-666666666666',action:'retract',revision:3}];window.pending.link({ok:true})});
  await feedback.getByText(/已撤回，保留历史/).waitFor();
  await feedback.getByLabel('记录来源',{exact:false}).selectOption('no_reply');
  await feedback.getByLabel('接触经过 / 无回复记录').fill('三天未回复');
  await feedback.getByLabel('对方角色与接触情境').fill('邮件联系店长');
  await feedback.getByLabel('我的解释（与原始记录分开）').fill('渠道未知');
  assert.equal(await feedback.getByLabel('我确认以上是逐字原话').count(),0);
  await feedback.getByRole('button',{name:'保存反馈记录',exact:true}).click();
  await page.waitForFunction(()=>window.calls.filter(c=>c.kind==='capture').length===3);
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.kind==='capture').at(-1).args.verbatim),false);
  await page.evaluate(()=>window.pending.capture({ok:true}));
  await feedback.getByText('已保存。',{exact:true}).first().waitFor();
  await feedback.getByLabel('记录来源',{exact:false}).selectOption('validation');
  await feedback.getByRole('button',{name:'读取既有验证',exact:true}).click();
  await feedback.getByLabel('选择既有验证').selectOption('33333333-3333-4333-8333-333333333333');
  await feedback.getByText(/既有验证备注：用户记下的验证备注/).waitFor();
  assert.equal(await feedback.locator('select[name=has_pain],select[name=will_pay]').count(),0);
  await feedback.getByLabel('对方角色与接触情境').fill('引用本人验证');
  await feedback.getByLabel('我的解释（与原始记录分开）').fill('只复查当前假设');
  await feedback.getByRole('button',{name:'保存反馈记录',exact:true}).click();
  await page.waitForFunction(()=>window.calls.filter(c=>c.kind==='capture').length===4);
  const validationCapture=await page.evaluate(()=>window.calls.filter(c=>c.kind==='capture').at(-1).args);
  assert.equal(validationCapture.validationId,'33333333-3333-4333-8333-333333333333');
  assert.equal('sourceNote' in validationCapture,false);
  assert.equal('hasPain' in validationCapture,false);
  await page.evaluate(()=>{window.readFails=true;window.pending.capture({ok:true})});
  await feedback.getByText(/已保存，但列表刷新未完成/).waitFor();
  assert.equal(await feedback.getByRole('button',{name:'保存反馈记录',exact:true}).isDisabled(),true);
  await page.evaluate(()=>window.readFails=false);
  await feedback.getByRole('button',{name:'重新读取',exact:true}).last().click();
  const conditions=page.locator('#conditions');await conditions.getByRole('button',{name:/归档条件/}).click();
  for(const [label,text] of [['学到了什么','目前替代方法足够'],['什么可观察的变化值得再看','替代方法停止夜间服务'],['如何核对这项变化','核对官网服务时间原文'],['适用范围与局限','仅限这家服务商']])await conditions.getByLabel(label,{exact:false}).fill(text);
  await conditions.getByRole('button',{name:'保存归档条件',exact:true}).click();await page.waitForFunction(()=>window.calls.some(c=>c.kind==='condition'));
  await page.evaluate(()=>{const a=window.calls.find(c=>c.kind==='condition').args;const c={id:'77777777-7777-4777-8777-777777777777',idea_id:window.idea,revision:1,kind:'condition',learned:a.learned,change_required:a.changeRequired,criterion:a.criterion,scope:a.scope,created_at:'2026-10-27T00:00:00Z'};window.conditions={status:'ready',items:[c],currentVersion:c,nextCursor:null};window.pending.condition({ok:true,id:c.id})});
  await conditions.getByText('人工核对这一版条件',{exact:true}).click();
  assert.equal(await conditions.getByLabel('我核对后的结论').inputValue(),'unknown');
  await conditions.getByLabel('实际材料的公开出处 URL').fill('https://example.com/service');
  await conditions.getByLabel('实际材料原文').fill('从下月起停止夜间服务。');
  await conditions.getByLabel('逐字引用（必须出现在实际材料中）').fill('停止夜间服务');
  await conditions.getByLabel('实际覆盖范围、局限与未知').fill('只覆盖该服务商，尚未问客户');
  await conditions.getByLabel('我核对后的结论').selectOption('met');
  await conditions.getByRole('button',{name:'保存人工核对',exact:true}).click();await page.waitForFunction(()=>window.calls.some(c=>c.kind==='evaluate'));
  assert.equal(await page.evaluate(()=>window.calls.find(c=>c.kind==='evaluate').args.expectedVersionId),'77777777-7777-4777-8777-777777777777');
  await page.evaluate(()=>{window.cues.items=[{id:'88888888-8888-4888-8888-888888888888',idea_id:window.idea,condition_version_id:window.conditions.currentVersion.id,kind:'cue',revision:3}];window.pending.evaluate({ok:true})});
  const cues=page.locator('#cues');
  await cues.getByRole('button',{name:'确认已查看此条件'}).click();
  await page.waitForFunction(()=>window.calls.some(c=>c.kind==='ack'));
  assert.equal(await page.evaluate(()=>window.calls.find(c=>c.kind==='ack').args.expectedVersionId),'77777777-7777-4777-8777-777777777777');
  await page.evaluate(()=>{window.cues.items=[];window.pending.ack({ok:true})});
  await cues.getByText('没有待查看的归档复查提示。').waitFor();
  assert.equal(await cues.getByRole('button',{name:'确认已查看此条件'}).count(),0);
  await page.screenshot({path:join(output,'feedback-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:join(output,'feedback-mobile.png'),fullPage:true});assert.deepEqual(errors,[]);
  writeFileSync(join(output,'feedback-browser-result.json'),JSON.stringify({passed:true,checks:['lazy private loads','original and interpretation split','unknown contact date','busy save','safe errors and retained input','retry identity','feedback outreach bridge','scoped cross idea confirmation','expected id retraction','no reply has no quote/signals','validation signals readonly','save refresh distinction','archived condition version','manual quote and coverage','unknown evaluation default','cue acknowledgement and removal','390px overflow','no browser errors']},null,2));
  console.log('Feedback UI browser fixture: 18 checks passed.');
} catch(error) {
  const page=browser?.contexts().flatMap(c=>c.pages())[0];if(page){try{writeFileSync(join(output,'feedback-failure.html'),await page.content());await page.screenshot({path:join(output,'feedback-failure.png'),fullPage:true});}catch{}}throw error;
} finally {await browser?.close();await new Promise(done=>server.close(done));}






