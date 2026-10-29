'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {loadBusinessJobStateAction,saveBusinessJobSettingsAction,prepareBusinessTodayAction,loadBusinessJobHistoryAction} from './job-actions';
import type {JobState,JobSettings,JobLease,SourceConfiguration} from '@/lib/domains/business-teardowns/jobs/types';
const inputClass='min-w-0 rounded-md border bg-background px-3 py-2 text-sm';
const buttonClass='rounded-md border px-3 py-2 text-sm disabled:opacity-50';
const statusLabel:Record<string,string>={running:'处理中',busy:'已有任务正在处理',completed:'报告已发布',materials_ready:'材料已准备',failed:'任务出错',unknown:'结果或用量未知',disabled:'任务未开启',not_due:'未到东京计划时间'};
const detailLabel:Record<string,string>={ready:'已就绪',pending:'未开始',started:'处理中',published:'已发布',not_permitted:'未开启自动AI',not_started:'未开始',failed:'出错',unknown:'结果或用量未知',completed:'已完成'};
const stageLabel:Record<string,string>={discovery:'来源发现',inspect:'商品核对',report:'报告生成'};
export function BusinessJobPanel({initialState,enabled}:{initialState:JobState;enabled:boolean}){
 const [state,setState]=useState(initialState),[draft,setDraft]=useState<JobSettings>(initialState.settings),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[history,setHistory]=useState<JobLease[]>([]),[cursor,setCursor]=useState<string|null|undefined>(undefined),[refreshFailed,setRefreshFailed]=useState(false),[pausing,setPausing]=useState(false);
 const opened=useRef(false),pending=useRef<{key:string;requestId:string}|null>(null),pausePending=useRef(false),pauseReceipt=useRef<{key:string;requestId:string}|null>(null),pausedDuringPrepare=useRef(false);
 const errorText=(error:unknown)=>error instanceof Error?error.message:'请求未确认，请重试';
 async function refresh(){const next=await loadBusinessJobStateAction();setState(next);setRefreshFailed(false);return next;}
 async function prepare(trigger:'manual'|'open'){
  setBusy(true);setMessage('');pausedDuringPrepare.current=false;
  try{const result=await prepareBusinessTodayAction({trigger});if(!pausedDuringPrepare.current)setMessage(statusLabel[result.status]??result.status);try{await refresh();}catch{if(!pausedDuringPrepare.current)setMessage(`${statusLabel[result.status]??result.status}；任务列表暂时读取失败，请刷新。`);}}
  catch(error){if(!pausedDuringPrepare.current)setMessage(errorText(error));}finally{setBusy(false);}
 }
 async function pause(){
  if(pausePending.current)return;pausePending.current=true;setPausing(true);
  const payload={...state.settings,enabled:false,autoAI:false,autoAIConfirmed:false,expectedRevision:state.settings.revision};const key=JSON.stringify(payload);if(pauseReceipt.current?.key!==key)pauseReceipt.current={key,requestId:crypto.randomUUID()};
  try{const saved=await saveBusinessJobSettingsAction({...payload,requestId:pauseReceipt.current.requestId});pauseReceipt.current=null;pausedDuringPrepare.current=true;pending.current=null;setState(previous=>({...previous,settings:saved}));setDraft(previous=>({...previous,enabled:false,autoAI:false,revision:saved.revision}));setConfirmed(false);setMessage('任务已暂停并撤回自动AI许可。在途结果不会发布；未保存的其他输入已保留。');}
  catch(error){setMessage(`暂停尚未确认：${errorText(error)}`);}finally{pausePending.current=false;setPausing(false);}
 }
 useEffect(()=>{if(!opened.current&&enabled&&initialState.available&&initialState.settings.enabled&&initialState.settings.prepareOnOpen){opened.current=true;void prepare('open');}},[enabled,initialState]); // eslint-disable-line react-hooks/exhaustive-deps
 async function save(){
  setBusy(true);setMessage('');
  const payload={...draft,autoAIConfirmed:confirmed,expectedRevision:draft.revision};const key=JSON.stringify(payload);if(pending.current?.key!==key)pending.current={key,requestId:crypto.randomUUID()};
  try{const saved=await saveBusinessJobSettingsAction({...payload,requestId:pending.current.requestId});setDraft(saved);setState(previous=>({...previous,settings:saved}));pending.current=null;setConfirmed(false);setMessage('设置已保存。');try{await refresh();}catch{setRefreshFailed(true);setMessage('设置已保存；任务列表暂时读取失败，请刷新。再次写入前须先读取确认。');}}
  catch(error){setMessage(`设置尚未确认：${errorText(error)}`);}finally{setBusy(false);}
 }
 async function loadHistory(){setBusy(true);try{const result=await loadBusinessJobHistoryAction(cursor?{before:cursor}:{});setHistory(previous=>[...previous,...result.items]);setCursor(result.nextCursor);}catch(error){setMessage(errorText(error));}finally{setBusy(false);}}
 function source(index:number,patch:Partial<SourceConfiguration>){setDraft(previous=>({...previous,sources:previous.sources.map((row,i)=>i===index?{...row,...patch}:row)}));}
 if(!state.available)return <section className="rounded-lg border p-5 text-sm" role="status">受控每日任务尚未就绪。请先完成 121 迁移；当前材料功能仍可使用。</section>;
 return <section aria-label="受控每日任务" className="space-y-5 rounded-lg border p-4 sm:p-6">
  <div><h2 className="text-lg font-medium">受控每日任务</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">每天只选一家未用作主案例的店。关键词与官方榜单均可作为入口；材料和报告分别记录。此处保存计划，真实调度需另行配置。</p></div>
  {!enabled&&<p role="status" className="rounded-md border p-3 text-sm">部署开关尚未开启，可保存设置；当前不会执行后台请求。</p>}
  {state.credentialAvailable===false&&<p role="status" className="text-sm">未配置乐天API凭据，官方来源当前不可用。</p>}
  {draft.revision!==state.settings.revision&&<div role="status" className="space-y-2 rounded-md border p-3 text-sm"><p>设置已在其他页面更新，未保存编辑仍保留。读取最新任务设置会替换当前未保存输入，请先保留需要的内容。</p><button className={buttonClass} disabled={busy} onClick={()=>{setDraft(state.settings);pending.current=null;setConfirmed(false);setMessage('已读取最新任务设置。');}}>读取最新任务设置</button></div>}
  <fieldset disabled={busy} className="space-y-4">
   <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={draft.enabled} onChange={e=>setDraft({...draft,enabled:e.target.checked})}/>启用独立每日任务（取消即暂停，并拒绝在途结果）</label>
   <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={draft.prepareOnOpen} onChange={e=>setDraft({...draft,prepareOnOpen:e.target.checked})}/>明确允许首次打开页面时准备今日材料</label>
   <div className="grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-sm">东京时间<input aria-label="东京时间" type="time" className={inputClass} value={draft.schedule} onChange={e=>setDraft({...draft,schedule:e.target.value})}/></label><label className="grid gap-1 text-sm">每日HTTP请求额度<input type="number" min="1" max="1000" className={inputClass} value={draft.httpBudget} onChange={e=>setDraft({...draft,httpBudget:Number(e.target.value)})}/></label><label className="grid gap-1 text-sm">每日AI请求额度<input type="number" min="0" max="10" className={inputClass} value={draft.aiBudget} onChange={e=>setDraft({...draft,aiBudget:Number(e.target.value)})}/></label></div>
   <div className="space-y-3"><h3 className="text-sm font-medium">官方来源与选题分组（用户配置）</h3><p className="text-xs leading-5 text-muted-foreground">类别、价位和经营方式是轮换标签，尚未证明店铺实际经营特征。仅使用楽天官方接口；不读取人工摘录、私人笔记或买家身份。</p>
    {draft.sources.map((row,index)=><div key={index} className="grid gap-2 rounded-md border p-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">来源方式<select className={inputClass} aria-label={`来源方式 ${index+1}`} value={row.mode} onChange={e=>source(index,{mode:e.target.value as SourceConfiguration['mode'],keyword:e.target.value==='search'?(row.keyword??''):undefined})}><option value="search">关键词搜索</option><option value="ranking">官方榜单</option></select></label>{row.mode==='search'&&<label className="grid gap-1 text-sm">关键词<input className={inputClass} aria-label={`关键词 ${index+1}`} maxLength={128} value={row.keyword??''} onChange={e=>source(index,{keyword:e.target.value})}/></label>}<label className="grid gap-1 text-sm">分类ID（可选）<input className={inputClass} value={row.genreId??''} onChange={e=>source(index,{genreId:e.target.value||undefined})}/></label>{(['category','priceBand','businessModel'] as const).map((key,i)=><label key={key} className="grid gap-1 text-sm">{['类别分组','价位分组','经营方式分组'][i]}<input className={inputClass} value={row[key]} onChange={e=>source(index,{[key]:e.target.value})}/></label>)}<button className={buttonClass} onClick={()=>setDraft({...draft,sources:draft.sources.filter((_,i)=>i!==index)})}>移除此来源</button></div>)}
    <button className={buttonClass} onClick={()=>setDraft({...draft,sources:[...draft.sources,{mode:'search',keyword:'',category:'未分类',priceBand:'未知',businessModel:'待核对'}]})}>添加官方来源</button>
   </div>
   <label className="grid gap-1 text-sm">排除主店（每行一个乐天店铺ID）<textarea className={inputClass} rows={3} value={draft.excluded.map(value=>value.replace(/^rakuten:/,'')).join('\n')} onChange={e=>setDraft({...draft,excluded:e.target.value.split('\n').map(line=>line.trim()).filter(Boolean).map(value=>`rakuten:${value.replace(/^rakuten:/,'')}`)})}/></label>
   <div className="space-y-2 rounded-md border p-3"><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={draft.autoAI} onChange={e=>setDraft({...draft,autoAI:e.target.checked})}/>自动AI：允许每日任务把官方公开标量字段交给 Google Gemini 生成并发布拆解</label><p className="text-xs leading-5 text-muted-foreground">自动许可第一版，仅楽天官方公开字段，不含人工摘录或私人笔记。逐次案例许可不会升级为本许可；关闭后拒绝下一次请求及在途结果。AI只寻找解释失效和不可迁移的条件。</p>{draft.autoAI&&!state.settings.autoAI&&<label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>我明确同意上述自动AI范围与版本</label>}</div>
   <div className="flex flex-wrap gap-2"><button className={buttonClass} disabled={refreshFailed||draft.revision!==state.settings.revision||(draft.autoAI&&!state.settings.autoAI&&!confirmed)} onClick={()=>void save()}>保存任务设置</button><button className={buttonClass} disabled={refreshFailed||!enabled||!state.settings.enabled} onClick={()=>void prepare('manual')}>准备今日</button><button className={buttonClass} onClick={()=>{setBusy(true);void refresh().then(()=>setMessage('任务记录已刷新')).catch(error=>setMessage(errorText(error))).finally(()=>setBusy(false));}}>刷新任务记录</button></div>
  </fieldset>
  <button className={buttonClass} disabled={pausing||(!state.settings.enabled&&!state.settings.autoAI)} onClick={()=>void pause()}>{pausing?'正在暂停…':'立即暂停并撤回自动AI'}</button>
  {message&&<p role="status" className="break-words text-sm">{message}</p>}
  <div className="space-y-2 border-t pt-4 text-sm"><h3 className="font-medium">今日执行记录</h3>{state.run?<><p>{state.run.localDate} · {statusLabel[state.run.status]??state.run.status}</p><p>材料：{detailLabel[state.run.materialStatus]??'待核对'} · 报告：{detailLabel[state.run.reportStatus]??'待核对'}</p>{state.run.message&&<p role="alert" className="break-words">{state.run.message}</p>}{state.run.caseId&&<Link className="underline" href={`/business-lab/${state.run.caseId}`}>打开今日案例</Link>}</>:<p>今日尚未启动任务。</p>}<p className="text-xs leading-5 text-muted-foreground">已占用额度：HTTP {state.attempts.filter(a=>a.kind==='http').length} / {state.settings.httpBudget}；AI {state.attempts.filter(a=>a.kind==='ai').length} / {state.settings.aiBudget}。票据在请求前预留，包含可能未送达的请求；重试不退还额度。实际用量未知时保留未知，不显示零成本。单次HTTP至多尝试三次并退避；AI结果未知不会自动重发。</p>
   {state.attempts.map(attempt=><div key={attempt.id} className="break-words rounded border p-2 text-xs">{attempt.kind.toUpperCase()} · {stageLabel[attempt.stage]??'请求处理'} · {detailLabel[attempt.status]??'待核对'} · 用量：{attempt.usage===null?'未知':JSON.stringify(attempt.usage)}{attempt.operation_reference&&<details className="mt-2"><summary className="cursor-pointer">核对请求记录</summary><p className="mt-1 break-all font-mono">{attempt.operation_reference}</p></details>}</div>)}
  </div>
  <div className="space-y-2 border-t pt-4 text-sm"><h3 className="font-medium">任务历史</h3>{history.map(item=><div key={item.runId} className="break-words rounded border p-2"><p>{item.localDate} · {statusLabel[item.status]??item.status}</p><p>{item.message}</p>{item.caseId&&<Link className="underline" href={`/business-lab/${item.caseId}`}>打开案例</Link>}</div>)}{cursor!==null&&<button className={buttonClass} disabled={busy} onClick={()=>void loadHistory()}>{cursor===undefined?'读取任务历史':'更早的任务'}</button>}</div>
 </section>;
}
