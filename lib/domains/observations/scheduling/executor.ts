import type {ApprovedStatisticalConfig,StatisticalPayload} from '../statistics/domain';
import type {ScheduleRun} from './domain';
export interface SchedulerDependencies {
 enabled:()=>boolean;credentials:()=>boolean;
 claim:(owner:string|null,scheduleId:string|null)=>Promise<ScheduleRun|null>;
 beforeRequest:(run:ScheduleRun)=>Promise<unknown>;
 loadConfig:(owner:string,configId:string)=>Promise<ApprovedStatisticalConfig>;
 provider:(config:ApprovedStatisticalConfig,options:{beforeRequest:()=>Promise<void>})=>Promise<StatisticalPayload>;
 finish:(run:ScheduleRun,success:boolean,payload:unknown,error?:string)=>Promise<{status:string}>;
 invalidate:(owner:string,configId:string,reason:'metadata_changed')=>Promise<unknown>;
}
export interface ScheduleReport {completed:number;failed:number;discarded:number;runs:{runId:string;status:'completed'|'failed'|'discarded';error?:string}[]}
function safeError(error:unknown){const message=error instanceof Error?error.message:'';if(['metadata_changed','credential_unavailable','scheduler_disabled','provider_request_failed'].includes(message))return message;if(/lease|source|disabled/i.test(message))return 'lease_or_source_unavailable';return 'provider_or_persistence_failed';}
export async function executeSchedules(deps:SchedulerDependencies,options:{ownerId?:string;scheduleId?:string;limit?:number}={}):Promise<ScheduleReport>{
 if(!deps.enabled())throw new Error('scheduler_disabled');if(!deps.credentials())throw new Error('credential_unavailable');
 if(Boolean(options.ownerId)!==Boolean(options.scheduleId))throw new Error('schedule_owner_required');
 const limit=options.scheduleId?1:Math.min(5,Math.max(1,options.limit??3));const report:ScheduleReport={completed:0,failed:0,discarded:0,runs:[]};
 const record=(run:ScheduleRun,result:{status:string},error?:string)=>{
  if(result.status==='completed'){report.completed++;report.runs.push({runId:run.id,status:'completed'});}
  else if(result.status==='failed'){report.failed++;report.runs.push({runId:run.id,status:'failed',error:error??'previous_attempt_failed'});}
  else{report.discarded++;report.runs.push({runId:run.id,status:'discarded',error:error??'worker_result_unavailable'});}
 };
 for(let at=0;at<limit;at++){
  if(!deps.enabled()||!deps.credentials())break;
  const run=await deps.claim(options.ownerId??null,options.scheduleId??null);if(!run)break;
  try{
   const config=await deps.loadConfig(run.user_id,run.config_id);
   const payload=await deps.provider(config,{beforeRequest:async()=>{if(!deps.enabled())throw new Error('scheduler_disabled');if(!deps.credentials())throw new Error('credential_unavailable');await deps.beforeRequest(run);}});
   if(!deps.enabled())throw new Error('scheduler_disabled');
   record(run,await deps.finish(run,true,payload,undefined));
  }catch(error){
   let reason=safeError(error);
   if(reason==='metadata_changed'){try{await deps.invalidate(run.user_id,run.config_id,'metadata_changed');}catch{reason='source_invalidation_failed';}}
   try{record(run,await deps.finish(run,false,null,reason),reason);}
   catch{report.discarded++;report.runs.push({runId:run.id,status:'discarded',error:reason});}
  }
 }
 return report;
}
