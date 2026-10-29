import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve, join } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright-core";

const output = resolve(process.argv[2] || ".next/reasoning-attention-ui-verification");
mkdirSync(output, { recursive: true });
const file = path => JSON.stringify(resolve(path).replaceAll("\\", "/"));
const entry = `import {normalizeReasoning} from ${file("lib/domains/observations/reasoning/domain.ts")};import{normalizeAttention}from ${file("lib/domains/observations/attention/domain.ts")};window.normalizeReasoning=normalizeReasoning;window.normalizeAttention=normalizeAttention;import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{ReasoningPanel}from ${file("app/(app)/signals/events/reasoning-panel.tsx")};
import{AttentionPanel}from ${file("app/(app)/signals/events/attention-panel.tsx")};
window.event='11111111-1111-4111-8111-111111111111';window.calls=[];window.reasoning=[];window.impacts=[];window.attention=[];window.sources=[{id:'22222222-2222-4222-8222-222222222222',title:'基准材料',captured_text:'旧文只有停产预告',source_url:'https://example.com/old',captured_at:'2026-10-27',capture_scope:'body'},{id:'33333333-3333-4333-8333-333333333333',title:'新材料标题',captured_text:'新文增加停产日期十一月',source_url:'https://example.com/new',captured_at:'2026-10-27',capture_scope:'body'}];
function App(){const[e,set]=useState(window.event);return <main className="mx-auto max-w-2xl p-4"><h1>推理与阅读约定 · 合成夹具</h1><button id="switch" onClick={()=>set('99999999-9999-4999-8999-999999999999')}>切换事件</button><div id="reasoning"><ReasoningPanel eventId={e}/></div><div id="attention"><AttentionPanel eventId={e}/></div></main>};createRoot(document.getElementById('root')).render(<App/>);`;
const mocks = {
  "reasoning-source-actions": `export async function listReasoningSourcesAction(eventId,after){window.calls.push({kind:'source-list',eventId,after});return {items:structuredClone([window.sources[after?1:0]]),nextCursor:after?null:'2'}};export async function getReasoningSourceAction(eventId,id){window.calls.push({kind:'source-get',eventId,id});return structuredClone(window.sources.find(s=>s.id===id))}`,
  "reasoning-actions": `export async function loadReasoningAction(eventId,after=0){window.calls.push({kind:'reasoning-load',eventId,after});if(window.readFail)throw Error('database-private-secret');return{ok:true,data:{available:true,entries:structuredClone(window.reasoning),impacts:structuredClone(window.impacts),nextRevision:null,currentRevision:window.reasoning.length}}}export async function saveReasoningAction(eventId,input){window.calls.push({kind:'reasoning-save',eventId,input});if(window.hold){await new Promise(r=>window.release=r)}if(window.saveFail)return {ok:false,message:'database-private-secret'};try{window.normalizeReasoning(input.kind,input.payload)}catch(e){return{ok:false,message:e.message}}const row={id:crypto.randomUUID(),event_id:eventId,revision:window.reasoning.length+1,kind:input.kind,payload:input.payload};window.reasoning.push(row);if(input.kind==='correction')window.impacts=[{id:crypto.randomUUID(),revision:1,subject_kind:'reasoning',subject_id:window.reasoning[0].id,old_conclusion:{text:'旧结论保留'},acknowledged:false}];if(input.kind==='ack')window.impacts[0].acknowledged=true;return{ok:true,data:structuredClone(row)}}`,
  "attention-actions": `export async function attentionStateAction(eventId,after){window.calls.push({kind:'attention-load',eventId,after});return{ok:true,data:{available:true,entries:structuredClone(window.attention),nextCursor:null}}}export async function saveAttentionAction(eventId,input){window.calls.push({kind:'attention-save',eventId,input});try{window.normalizeAttention(input.kind,input.payload)}catch(e){return{ok:false,message:e.message}}const row={id:crypto.randomUUID(),revision:String(window.attention.length+1),event_id:eventId,kind:input.kind,version_id:input.versionId||null,payload:{...input.payload}};if(input.kind==='register'){row.payload={...row.payload,ordinal:1,sampled:true,snapshot:{body:'冻结正文，不含揭晓标题',sourceUrl:'https://example.com/new'},rule:{everyNth:3,triggers:'发生停产',counterevidence:'恢复生产'}}}if(input.kind==='blind_start'){row.payload={...row.payload,body:'冻结正文，不含揭晓标题',sourceUrl:'https://example.com/new'}}if(input.kind==='blind_reveal'||input.kind==='blind_exit'){row.payload={...row.payload,title:'揭晓后才出现的标题',body:'冻结正文，不含揭晓标题',sourceUrl:'https://example.com/new'}}window.attention.push(row);if(input.kind==='contract'&&window.lostContractResponse){window.lostContractResponse=false;return {ok:false,message:'response lost'}}return{ok:true,data:structuredClone(row)}}`,
};
const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, format: "iife", jsx: "automatic", platform: "browser", tsconfig: resolve("tsconfig.json"), define: { "process.env.NODE_ENV": '"development"' }, plugins: [{ name: "reasoning-attention-fixture", setup(b) {
  b.onResolve({ filter: /./ }, args => { const key = Object.keys(mocks).find(k => args.path.split("/").at(-1) === k); return key ? { path: key, namespace: "fixture" } : undefined; });
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
  page.setDefaultTimeout(10000); page.on("pageerror",e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:"networkidle"});
  assert.equal(await page.evaluate(()=>window.calls.length),0);
  const reasoning=page.locator('#reasoning'),attention=page.locator('#attention');
  await reasoning.getByRole('button',{name:'主动读取推理记录'}).click();
  await reasoning.getByText('追加一次人工核对',{exact:true}).click();
  const form=reasoning.locator('form').last();
  await form.getByLabel('我的判断 / 这次学到了什么').fill('转载也增加具体事实');
  await form.getByRole('button',{name:'选择基准 / 左侧 / 更正前材料'}).click();
  await form.getByRole('button',{name:/^基准材料/}).click();
  await form.getByLabel('第 1 份材料逐字引用').fill('停产预告');
  await form.getByRole('button',{name:'选择新材料 / 右侧 / 更正后材料'}).click();
  await form.getByRole('button',{name:'选择新材料 / 右侧 / 更正后材料'}).locator('..').getByRole('button',{name:'读取更多来源'}).click();
  await form.getByRole('button',{name:/^新材料标题/}).click();
  await form.getByLabel('第 2 份材料逐字引用').fill('停产日期十一月');
  await form.getByLabel('新材料增加了什么具体事实').fill('停产日期十一月');
  await form.getByLabel('来源独立性（与是否有新增事实分别判断）').selectOption('shared');
  await form.getByLabel('独立性依据 / 为什么仍未知').fill('明确转载');
  await page.evaluate(()=>{window.hold=true;window.saveFail=true});
  await form.getByRole('button',{name:'保存推理记录',exact:true}).click();
  await page.waitForFunction(()=>window.calls.some(c=>c.kind==='reasoning-save'));
  assert.equal(await form.getByRole('button',{name:'正在保存……'}).isDisabled(),true);assert.equal(await reasoning.getByLabel('核对内容',{exact:true}).isDisabled(),true);assert.equal(await reasoning.getByRole('button',{name:'重新读取推理记录'}).isDisabled(),true);
  assert.equal(await form.getByRole('button',{name:'选择新材料 / 右侧 / 更正后材料'}).isDisabled(),true);
  const first=await page.evaluate(()=>window.calls.find(c=>c.kind==='reasoning-save').input);
  assert.equal(first.payload.independence,'shared');assert.equal(first.payload.increment,'停产日期十一月');assert.equal(first.payload.addition.snapshotId,'33333333-3333-4333-8333-333333333333');
  assert.equal(await page.evaluate(()=>window.calls.some(c=>c.kind==='source-list'&&c.after==='2')),true);
  await page.evaluate(()=>{window.hold=false;window.release()});
  await form.getByText(/未保存，请检查原话/).waitFor();assert.equal(await page.getByText('database-private-secret').count(),0);
  assert.equal(await form.getByLabel('新材料增加了什么具体事实').inputValue(),'停产日期十一月');
  await page.evaluate(()=>{window.saveFail=false;window.readFail=true});
  await form.getByRole('button',{name:'保存推理记录',exact:true}).click();
  await form.getByText(/已保存，但列表刷新未完成/).waitFor();
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.kind==='reasoning-save').at(-1).input.requestId),first.requestId);
  assert.equal(await form.getByRole('button',{name:'保存推理记录',exact:true}).isDisabled(),true);
  await page.evaluate(()=>window.readFail=false);await form.getByRole('button',{name:'重新读取',exact:true}).click();
  await reasoning.getByLabel('核对内容',{exact:true}).selectOption('comparability');
  await form.getByLabel('我的判断 / 这次学到了什么').fill('缺定义暂不可比');
  for(const side of ['左侧','右侧'])for(const d of ['统计定义','单位','周期','地域','名义 / 实际口径','金额 / 数量口径'])await form.getByLabel(`${side}${d}（缺失写未知）`,{exact:false}).fill(side==='左侧'?'未知':'订单数');
  await form.getByText('这次判断显式依赖哪些旧记录（可选）',{exact:true}).click();await form.locator('input[name=claimIds]').first().check();await form.getByLabel('可比依据 / 不可比原因').fill('定义缺失');await form.getByRole('button',{name:'保存推理记录',exact:true}).click();await form.getByText('已保存。',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.reasoning.at(-1).payload.verdict),'not_comparable');
  await reasoning.getByLabel('核对内容',{exact:true}).selectOption('mechanism');await form.getByLabel('我的判断 / 这次学到了什么').fill('末环未知');await form.getByLabel('第 1 环发生了什么 / 如何传导').fill('需求增加');await form.getByLabel('第 1 环仍未知什么').fill('尚未出现真实订单');await form.getByRole('button',{name:'保存推理记录',exact:true}).click();await form.getByText('已保存。',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.reasoning.at(-1).payload.links[0].unknown),'尚未出现真实订单');
  await reasoning.getByLabel('核对内容',{exact:true}).selectOption('correction');await form.getByLabel('我的判断 / 这次学到了什么').fill('来源更正，应复查');
  for(const [label,index,quote]of [['选择基准 / 左侧 / 更正前材料',0,'停产预告'],['选择新材料 / 右侧 / 更正后材料',1,'停产日期十一月']]){await form.getByRole('button',{name:label}).click();if(index)await form.getByRole('button',{name:'选择新材料 / 右侧 / 更正后材料'}).locator('..').getByRole('button',{name:'读取更多来源'}).click();await form.getByRole('button',{name:index?/^新材料标题/:/^基准材料/}).click();await form.getByLabel(`第 ${index+1} 份材料逐字引用`).fill(quote)}
  await form.getByRole('button',{name:'保存推理记录',exact:true}).click();await reasoning.getByText(/来源已更正，请复查原结论/).waitFor();await reasoning.getByRole('button',{name:'确认已查看此影响'}).click();await reasoning.getByText(/来源已更正，请复查原结论/).waitFor({state:'hidden'});
  await attention.getByRole('button',{name:'主动读取阅读约定'}).click();await attention.getByText('建立新的阅读约定',{exact:true}).click();
  await attention.getByLabel('什么可观察的变化值得提醒').fill('发生停产');await attention.getByLabel('什么反例不能忽略').fill('恢复生产');await attention.getByRole('button',{name:'保存为新版本'}).click();await attention.getByText('当前约定：每 3 次登记留 1 条，从第 1 条开始，包含跳过项。',{exact:true}).waitFor();
  await attention.getByText('主动登记一份材料（包括跳过）',{exact:true}).click();await attention.getByRole('button',{name:'选择实际看到 / 跳过的材料'}).click();await attention.getByRole('button',{name:/^基准材料/}).click();await attention.getByLabel('我对这份材料的实际选择').selectOption('skip');await attention.getByRole('button',{name:'登记我的选择'}).click();await attention.getByText('查看全部登记与冻结留样（1）',{exact:true}).click();
  await attention.getByRole('heading',{name:'登记 #1 · 跳过 · 固定留样'}).waitFor();assert.equal(await attention.getByText('揭晓后才出现的标题',{exact:true}).count(),0);
  await attention.getByRole('button',{name:'自愿先读正文再看标题'}).click();await attention.getByText('冻结正文，不含揭晓标题',{exact:true}).last().waitFor();assert.equal(await attention.getByRole('button',{name:'揭晓标题',exact:true}).count(),0);
  await attention.getByLabel('只读上述正文，我自己的判断 / 仍未知什么').fill('只确认停产，不推断订单');await attention.getByRole('button',{name:'先保存我的判断'}).click();await attention.getByRole('button',{name:'揭晓标题',exact:true}).click();await attention.getByText('已揭晓标题：揭晓后才出现的标题',{exact:true}).waitFor();assert.equal(await attention.getByRole('button',{name:'先保存我的判断'}).count(),0);
  await attention.getByText('追加复查备注',{exact:true}).click();await attention.getByLabel('回看这次选择，学到了什么 / 还未知什么').fill('跳过仍需回看');await attention.getByRole('button',{name:'保存复查备注'}).click();await attention.getByText('复查备注：跳过仍需回看',{exact:true}).waitFor();
  await attention.getByLabel('什么可观察的变化值得提醒').fill('发生停产');await attention.getByLabel('什么反例不能忽略').fill('恢复生产');await attention.getByLabel('固定规则：每 N 次主动登记留 1 条（N 为正整数）').fill('5');await page.evaluate(()=>window.lostContractResponse=true);await attention.getByRole('button',{name:'保存为新版本'}).click();await attention.getByText(/未保存，请检查当前版本/).waitFor();
  const lost=await page.evaluate(()=>window.calls.filter(c=>c.kind==='attention-save'&&c.input.kind==='contract').at(-1).input);
  await attention.getByRole('button',{name:'重新读取阅读约定'}).click();await attention.getByText('当前约定：每 5 次登记留 1 条，从第 1 条开始，包含跳过项。',{exact:true}).waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('#attention button')].some(b=>b.textContent==='重新读取阅读约定'&&!b.disabled));await attention.getByLabel('什么可观察的变化值得提醒').fill('发生停产');await attention.getByLabel('什么反例不能忽略').fill('恢复生产');await attention.getByLabel('固定规则：每 N 次主动登记留 1 条（N 为正整数）').fill('5');await attention.getByRole('button',{name:'保存为新版本'}).click();await attention.getByText('当前约定：每 5 次登记留 1 条，从第 1 条开始，包含跳过项。',{exact:true}).waitFor();
  await page.waitForFunction(()=>window.calls.filter(c=>c.kind==='attention-save'&&c.input.kind==='contract').length===3);await attention.getByRole('button',{name:'保存为新版本'}).waitFor();const retried=await page.evaluate(()=>window.calls.filter(c=>c.kind==='attention-save'&&c.input.kind==='contract').at(-1).input);assert.notEqual(retried.requestId,lost.requestId);assert.notEqual(retried.versionId,lost.versionId);await attention.getByText('冻结规则：每 3 次登记留 1 条，从第 1 条开始。',{exact:true}).waitFor();
  await attention.getByRole('button',{name:'退出这版阅读约定'}).click();await attention.getByText('目前没有进行中的阅读约定。',{exact:true}).waitFor();const exitId=await page.evaluate(()=>window.attention.at(-1).id);
  await attention.getByLabel('什么可观察的变化值得提醒').fill('新变化');await attention.getByLabel('什么反例不能忽略').fill('新反例');await attention.getByRole('button',{name:'保存为新版本'}).click();await attention.getByRole('button',{name:'退出这版阅读约定'}).waitFor();assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.kind==='attention-save'&&c.input.kind==='contract').at(-1).input.versionId),exitId);
  await attention.getByText('主动登记一份材料（包括跳过）',{exact:true}).click();await attention.getByRole('button',{name:'选择实际看到 / 跳过的材料'}).click();await attention.getByRole('button',{name:/^基准材料/}).click();await attention.getByLabel('我对这份材料的实际选择').selectOption('seen');await attention.getByRole('button',{name:'登记我的选择'}).click();await attention.getByRole('button',{name:'自愿先读正文再看标题'}).click();await attention.getByRole('button',{name:'直接退出先判实验'}).click();await attention.getByText('已退出先判实验：揭晓后才出现的标题',{exact:true}).waitFor();assert.equal(await attention.getByRole('button',{name:'先保存我的判断'}).count(),0);
  await page.screenshot({path:join(output,'reasoning-attention-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:join(output,'reasoning-attention-mobile.png'),fullPage:true});
  await page.locator('#switch').click();await reasoning.getByRole('button',{name:'主动读取推理记录'}).waitFor();await attention.getByRole('button',{name:'主动读取阅读约定'}).waitFor();assert.equal(await page.getByText('转载也增加具体事实',{exact:true}).count(),0);assert.deepEqual(errors,[]);
  writeFileSync(join(output,'reasoning-attention-browser-result.json'),JSON.stringify({passed:true,checks:['lazy reads','real source picker keyset pages and actual original','increment independent from source relation','busy disables picker','safe failure retains input and retry identity','save refresh failure retains form and disables resave','missing comparison definition','mechanism endpoint unknown','correction impact acknowledgement','contract version and fixed rule','skip counted in fixed sample','titleless body then frozen judgment then reveal','review note','lost response then refreshed version uses new identity','contract revision preserves old sample rule','exit contract then restart with expected exit id','explicit seen registration','voluntary blind exit prevents later judgment','event switch resets private state','390px no overflow','no browser errors']},null,2));
  console.log('Reasoning/attention browser fixture: 21 checks passed.');
} catch(error) { const page=browser?.contexts().flatMap(c=>c.pages())[0];if(page){try{writeFileSync(join(output,'reasoning-attention-failure.html'),await page.content());await page.screenshot({path:join(output,'reasoning-attention-failure.png'),fullPage:true});}catch{}}throw error; }
finally {await browser?.close();await new Promise(done=>server.close(done));}
