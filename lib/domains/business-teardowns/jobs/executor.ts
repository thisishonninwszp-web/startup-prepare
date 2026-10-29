import {randomUUID} from 'node:crypto';
import {generateBusinessTeardownReport,MODEL,BUSINESS_REPORT_PROMPT_VERSION} from '@/lib/ai';
import {searchBusinessCandidates,inspectRakutenItem} from '../providers/rakuten';
import {selectCandidate} from '../selection';
import {admissible,type QueuedCandidate} from '../rules';
import {validateBusinessReport} from '../report-validation';
import type {DraftStart,DraftLease,ReportSource,CaseSection} from '../report-domain';
import type {SnapshotInput} from '../domain';
import {jobCommand,businessJobsEnabled} from './commands';
import type {JobResult,JobLease,JobState} from './types';
export type JobDependencies={command:<T>(operation:string,input?:object)=>Promise<T>;search:typeof searchBusinessCandidates;inspect:typeof inspectRakutenItem;generate:typeof generateBusinessTeardownReport;enabled:()=>boolean;aiEnabled:()=>boolean;sleep:(ms:number)=>Promise<void>;now:()=>Date};
const AUTO_SCALARS=new Set(['itemCode','itemName','shopCode','shopName','itemUrl','shopUrl','itemPrice','hasPriceRange','itemPriceBaseField','itemPriceMin1','itemPriceMax1','itemPriceMin2','itemPriceMax2','itemPriceMin3','itemPriceMax3','reviewCount','availability','taxFlag','postageFlag','creditCardFlag','giftFlag','startTime','endTime','genreId','currency']);
export function officialScalarSnapshot(snapshot:SnapshotInput):SnapshotInput{
 if(snapshot.platform!=='rakuten'||snapshot.origin!=='official_api'||snapshot.captureScope!=='api_fields'||snapshot.capturedText!==null)throw new Error('自动任务只允许官方公开标量材料');
 return {...snapshot,capturedText:null,structured:Object.fromEntries(Object.entries(snapshot.structured).filter(([key,value])=>AUTO_SCALARS.has(key)&&['string','number','boolean'].includes(typeof value)))};
}
export async function executeBusinessJob(owner:string,trigger:'manual'|'cron'|'open',injected?:JobDependencies):Promise<JobResult>{
 const d:JobDependencies=injected??{command:<T>(op:string,input:object={})=>jobCommand<T>(owner,op,input),search:searchBusinessCandidates,inspect:inspectRakutenItem,generate:generateBusinessTeardownReport,enabled:businessJobsEnabled,aiEnabled:()=>process.env.BUSINESS_TEARDOWNS_AI_ENABLED==='true',sleep:ms=>new Promise(resolve=>setTimeout(resolve,ms)),now:()=>new Date()};
 if(!d.enabled())return {status:'disabled'};
 let run=await d.command<JobLease>('claim',{trigger});if(run.status!=='running')return run;
 let httpReservations=0;
 const assertEnabled=()=>{if(!d.enabled())throw new Error('自动任务开关已暂停');};
 const check=async(ai=false)=>{assertEnabled();if(ai&&!d.aiEnabled())throw new Error('自动AI开关已暂停');await d.command('check',run);};
 async function http<T>(stage:string,transport:(beforeRequest:()=>Promise<void>)=>Promise<T>):Promise<T>{
  for(let attempt=0;attempt<3;attempt++){
   let ticket:{id:string}|undefined;let returned=false;
   try {
    await check();
    if(stage==='discovery'&&httpReservations>=run.settings.httpBudget-1)throw new Error('HTTP额度不足：需保留一次请求核对主店商品，候选分页已保存供后续日期继续');
    const result=await transport(async()=>{await check();ticket=await d.command('ticket',{...run,kind:'http',stage,requestId:randomUUID()});httpReservations++;});
    returned=true;await check();if(!ticket)throw new Error('官方来源未发出受控请求');
    await d.command('settle',{...run,ticketId:ticket.id,status:'completed',usage:null});return result;
   }catch(error){
    // A rejected late result cannot be retried under the withdrawn settings.
    if(returned||!ticket)throw error;
    await check();await d.command('settle',{...run,ticketId:ticket.id,status:'failed',usage:null});
    if(attempt===2)throw error;await d.sleep(250*2**attempt);
   }
  }
  throw new Error('来源重试次数已用尽');
 }
 try {
  await check();
  if(!run.caseId){
   let state=await d.command<JobState>('state');httpReservations=state.attempts?.filter(attempt=>attempt.kind==='http').length??0;let selected=selectCandidate(state.candidates,state.history);
   if(!selected){
    if(!run.settings.sources.length)throw new Error('未配置官方关键词或榜单来源');
    const sources=run.settings.sources.map((source,index)=>({source,index}));
    const offset=Math.floor(Date.parse(`${run.localDate}T00:00:00Z`)/86400000)%sources.length;
    const rotated=[...sources.slice(offset),...sources.slice(0,offset)];
    for(const {source,index} of rotated){
     let page=state.sourceCursors?.[String(index)]??1;
     for(;;){
      const result=await http('discovery',beforeRequest=>d.search({mode:source.mode,keyword:source.mode==='search'?source.keyword:undefined,genreId:source.genreId,page,beforeRequest}));
      const candidates:QueuedCandidate[]=result.items.map(item=>({...item,category:source.category,priceBand:source.priceBand,businessModel:source.businessModel,sourcePage:page,capturedAt:d.now().toISOString()})).filter(admissible);
      await check();await d.command('enqueue',{...run,candidates,sourceCursor:{sourceKey:String(index),nextPage:result.nextCursor?Number(result.nextCursor):1,coverage:result.coverage,capturedAt:d.now().toISOString()}});
      state={...state,candidates:[...state.candidates,...candidates]};selected=selectCandidate(state.candidates,state.history);
      if(selected)break;
      if(!result.nextCursor)break;page=Number(result.nextCursor);if(!Number.isSafeInteger(page)||page<1)throw new Error('官方分页游标无效');
     }
     if(selected)break;
    }
   }
   if(!selected)throw new Error('没有符合准入及排除规则的新主店候选；未替换旧槽位');
   await check();run=await d.command<JobLease>('reserve',{...run,...selected,reason:selected.reason});
  }
  if(run.materialStatus!=='ready'){
   if(!run.candidate)throw new Error('今日已有手动槽位；请为该店补充公开材料，自动任务不会换店');
   const item=await http('inspect',beforeRequest=>d.inspect(run.candidate!.itemCode,{shopCode:run.candidate!.merchant.platformShopId,beforeRequest}));
   await check();run=await d.command<JobLease>('material',{...run,merchant:item.merchant,snapshot:officialScalarSnapshot(item.snapshot)});
  }
  await check();
  if(!run.settings.autoAI||!d.aiEnabled())return await d.command<JobResult>('complete',{...run,message:'材料已准备；自动AI未明确启用。对照资料如未采集则保持缺口。'});
  const started=await d.command<DraftStart|{status:'not_permitted'}>('ai_start',run);
  if(started.status==='not_permitted')return await d.command<JobResult>('complete',{...run,message:'自动AI许可不可用，仅准备材料。'});
  if(started.status!=='ready')throw new Error('AI请求已有回执或正在处理，请检查任务记录');
  const lease:DraftLease=started.lease;
  await check(true);const before=await d.command<{sources:ReportSource[]}>('verify_ai',{...run,draftLease:lease});
  const ticket=await d.command<{id:string}>('ticket',{...run,kind:'ai',stage:'report',requestId:randomUUID()});
  // No catch-retry around the provider: uncertain delivery is a terminal receipt.
  const sections:CaseSection[]=await d.generate({ownerId:owner,caseId:lease.caseId,requestId:lease.requestId,sources:before.sources});
  await check(true);const after=await d.command<{sources:ReportSource[]}>('verify_ai',{...run,draftLease:lease});
  const checked=validateBusinessReport({sections},after.sources);
  await d.command('settle',{...run,ticketId:ticket.id,status:'completed',usage:null});
  await check(true);return await d.command<JobResult>('finish',{...run,draftLease:lease,report:{sections:checked,model:MODEL,promptVersion:BUSINESS_REPORT_PROMPT_VERSION}});
 }catch(error){
  const message=error instanceof Error?error.message:'任务执行出错';
  try{return await d.command<JobResult>('fail',{...run,message});}catch(receiptError){throw new Error(`${message}；任务失败回执未确认：${receiptError instanceof Error?receiptError.message:'未知错误'}`);}
 }
}
