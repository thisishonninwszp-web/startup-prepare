'use client';
import React,{useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {ConnectedForm,Choice,value} from './connected-form';
import {loadSchedulingAction,saveScheduleAction} from './scheduling-actions';
import type {ObservationSchedule,SchedulingState} from '@/lib/domains/observations/scheduling/domain';
function IntegerField({name,label,initial,min,max}:{name:string;label:string;initial:number;min:number;max:number}){return <label className="block space-y-1 text-xs leading-6"><span>{label}</span><input className="h-10 w-full rounded-md border bg-background px-3 text-sm" name={name} type="number" required min={min} max={max} step={1} defaultValue={initial}/></label>;}
const health:Record<string,string>={ready:'等待运行',running:'请求进行中',paused:'已停用',blocked:'已阻止：请查看原因',failed:'已达最大尝试，请检查后再启用'};
const errorText:Record<string,string>={daily_request_budget_exhausted:'今日请求预算不足，本轮需预留两次请求',source_unavailable:'来源已失效或删除',source_changed_reconfirm:'来源口径变化，请重新预览并批准',lease_expired_conservative_charge:'租约过期，本轮保留两次请求计费',schedule_changed:'用户修改或停用了调度',metadata_changed:'官方口径变化，来源需要重新确认',provider_request_failed:'官方请求未完成',credential_unavailable:'缺少统计来源凭证',scheduler_disabled:'调度开关已关闭'};
function ScheduleForm({state,schedule,reload}:{state:SchedulingState;schedule?:ObservationSchedule;reload:()=>Promise<void>}){
 const choices:(readonly [string,string])[]=state.sources.map(source=>[source.id,`表 ${source.table_id} · ${JSON.stringify(source.filters)}`] as const);
 if(schedule&&!choices.some(([id])=>id===schedule.config_id))choices.unshift([schedule.config_id,'当前来源不可用；仍可停用此调度']);
 return <ConnectedForm key={schedule?`${schedule.id}:${schedule.revision}`:'new'} operation={schedule?`observation-schedule:${schedule.id}:revision:${schedule.revision}`:'observation-schedule:new'} label={schedule?'保存周期、预算或停用':'保存调度配置'} onSaved={reload} submit={async(data,requestId)=>saveScheduleAction({scheduleId:schedule?.id??null,expectedRevision:schedule?.revision??null,configId:value(data,'configId'),enabled:value(data,'enabled')==='true',intervalMinutes:Number(value(data,'intervalMinutes')),dailyBudget:Number(value(data,'dailyBudget')),maxAttempts:Number(value(data,'maxAttempts')),requestId})}>
  <Choice name="configId" label="已预览并批准的统计单元" options={choices} initial={schedule?.config_id}/>
  <Choice name="enabled" label="运行授权" options={[["false","停用：不开始新请求"],["true","启用：允许在预算内运行"]]} initial={schedule?.enabled?'true':'false'}/>
  <IntegerField name="intervalMinutes" label="周期（分钟，至少60）" initial={schedule?.interval_minutes??1440} min={60} max={43200}/>
  <IntegerField name="dailyBudget" label="本调度每日请求次数预算（整数）" initial={schedule?.daily_budget??4} min={1} max={10000}/>
  <IntegerField name="maxAttempts" label="连续失败最多尝试次数" initial={schedule?.max_attempts??3} min={1} max={5}/>
 </ConnectedForm>;
}
export function SchedulingContent({state,reload}:{state:SchedulingState;reload:()=>Promise<void>}){
 if(!state.available)return <p role="status" className="text-sm">预算调度不可用，请完成116与118数据库更新。</p>;
 return <div className="space-y-4 text-sm leading-6">
  <p className="text-xs text-muted-foreground">仅运行已预览并批准的固定 e-Stat 统计单元。预算按东京自然日计算；每轮先预留两次 HTTP 请求，正常结束退回未尝试额度，租约过期保守计满两次。失败不表示统计值为零。</p>
  <p className="text-xs text-muted-foreground">本功能尚未配置生产定时器。保存配置不代表后台已持续运行；需要另行设置受保护的 cron 调用。停用后在途结果也不会保存。</p>
  {state.sources.length?<details><summary className="cursor-pointer font-medium">新建预算调度（默认停用）</summary><ScheduleForm state={state} reload={reload}/></details>:<p>请先在统计分母面板完成实际样本预览与口径确认，再创建调度。</p>}
  {state.schedules.map(schedule=><details key={`${schedule.id}:${schedule.revision}`} className="rounded-md border p-3"><summary className="cursor-pointer break-words">{health[schedule.health]??schedule.health} · 每 {schedule.interval_minutes} 分钟 · 今日预算 {schedule.daily_budget} 次</summary><p className="mt-2 text-xs">今日已计费或预留：{state.budgets.find(b=>b.schedule_id===schedule.id)?.charged??0} 次；连续失败 {schedule.failures}/{schedule.max_attempts}。下次：{schedule.next_run_at}</p>{schedule.last_error&&<p role="status" className="break-words text-xs">{errorText[schedule.last_error]??schedule.last_error}</p>}<ScheduleForm state={state} schedule={schedule} reload={reload}/></details>)}
  <div className="space-y-2"><p className="font-medium">运行记录（原周期、预算及尝试均保留）</p>{state.runs.length===0&&<p className="text-xs text-muted-foreground">尚无运行记录。</p>}{state.runs.map(run=><article key={run.id} className="rounded border p-3 text-xs"><p>{run.created_at} · {run.status} · 已尝试 {run.requests_attempted}/{run.reserved} 次请求</p>{run.error&&<p className="break-words">{errorText[run.error]??run.error}</p>}{run.status==='expired'&&<p>本轮租约过期，按已预留两次保守计费。</p>}</article>)}</div>
 </div>;
}
export function SchedulingPanel(){
 const [state,setState]=useState<SchedulingState|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const reload=async()=>{const next=await loadSchedulingAction();setState(next);setError('');};
 useEffect(()=>{let active=true;loadSchedulingAction().then(next=>{if(active)setState(next);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'读取失败');});return()=>{active=false;};},[]);
 return <section className="space-y-3 rounded-lg border p-4"><h2 className="font-medium">可停用的预算调度</h2>{error&&<p role="alert" className="text-xs">{error}</p>}{!state&&!error&&<p className="text-xs">正在读取调度……</p>}{state&&<SchedulingContent state={state} reload={reload}/>}<Button variant="outline" size="sm" disabled={busy} onClick={async()=>{setBusy(true);try{await reload();}catch(e){setError(e instanceof Error?e.message:'读取失败');}finally{setBusy(false);}}}>重新读取</Button>{state?.nextCursor&&<Button variant="outline" size="sm" disabled={busy} onClick={async()=>{setBusy(true);try{const next=await loadSchedulingAction(state.nextCursor);setState({...next,runs:[...state.runs,...next.runs.filter(r=>!state.runs.some(old=>old.id===r.id))]});}catch(e){setError(e instanceof Error?e.message:'读取失败');}finally{setBusy(false);}}}>更早的运行记录</Button>}</section>;
}
