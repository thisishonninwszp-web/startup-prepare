import { supabaseAdmin } from '@/lib/supabase';
import { uuid,isMissingObservationSchema,type ObservationTask,type TaskVersion,type ObservationRun } from './domain';
export type TaskListOptions={objectType?:string;objectId?:string;cursor?:string};
export type TaskDetailOptions={versionBefore?:number;runCursor?:string};
export function observationCursorFilter(cursor:string){
  const [date,id,...extra]=cursor.split('|');uuid.parse(id);
  if(extra.length||!date||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(date)||!Number.isFinite(Date.parse(date)))throw new Error('无效分页位置');
  return `created_at.lt.${date},and(created_at.eq.${date},id.lt.${id})`;
}
const cursorOf=(r:{created_at:string;id:string})=>`${r.created_at}|${r.id}`;
export async function listTasks(userId:string,options:TaskListOptions={}):Promise<{status:'ready'|'missing-schema';items:ObservationTask[];nextCursor:string|null}> {
  uuid.parse(userId);if(options.objectId)uuid.parse(options.objectId);
  let query=supabaseAdmin.from('decision_observation_tasks').select('*,versions:decision_observation_versions(*)').eq('user_id',userId)
    .order('created_at',{ascending:false}).order('id',{ascending:false})
    .order('revision',{referencedTable:'versions',ascending:false}).limit(1,{referencedTable:'versions'});
  if(options.objectType)query=query.eq('object_type',options.objectType);
  if(options.objectId)query=query.eq('object_id',options.objectId);
  if(options.cursor)query=query.or(observationCursorFilter(options.cursor));
  const {data,error}=await query.limit(31);
  if(error){if(isMissingObservationSchema(error))return{status:'missing-schema',items:[],nextCursor:null};throw new Error(error.message);}
  const rows=(data??[]) as ObservationTask[];const items=rows.slice(0,30);
  return{status:'ready',items,nextCursor:rows.length>30?cursorOf(items[29]):null};
}
export async function getTask(userId:string,id:string,options:TaskDetailOptions={}):Promise<{status:'ready'|'missing-schema';task:ObservationTask|null;versions:TaskVersion[];runs:ObservationRun[];versionsNextBefore:number|null;runsNextCursor:string|null}> {
  uuid.parse(userId);uuid.parse(id);
  const empty={task:null,versions:[],runs:[],versionsNextBefore:null,runsNextCursor:null};
  const task=await supabaseAdmin.from('decision_observation_tasks').select('*').eq('user_id',userId).eq('id',id).maybeSingle();
  if(task.error){if(isMissingObservationSchema(task.error))return{status:'missing-schema',...empty};throw new Error(task.error.message);}
  if(!task.data)return{status:'ready',...empty};
  let versionsQuery=supabaseAdmin.from('decision_observation_versions').select('*').eq('user_id',userId).eq('task_id',id).order('revision',{ascending:false});
  let runsQuery=supabaseAdmin.from('decision_observation_runs').select('*').eq('user_id',userId).eq('task_id',id).order('created_at',{ascending:false}).order('id',{ascending:false});
  if(options.versionBefore!==undefined){if(!Number.isSafeInteger(options.versionBefore)||options.versionBefore<1)throw new Error('无效版本位置');versionsQuery=versionsQuery.lt('revision',options.versionBefore);}
  if(options.runCursor)runsQuery=runsQuery.or(observationCursorFilter(options.runCursor));
  const [versions,runs]=await Promise.all([versionsQuery.limit(31),runsQuery.limit(6)]);
  const error=versions.error??runs.error;if(error){if(isMissingObservationSchema(error))return{status:'missing-schema',...empty};throw new Error(error.message);}
  const vs=(versions.data??[]) as TaskVersion[];const rs=(runs.data??[]) as ObservationRun[];
  return{status:'ready',task:task.data as ObservationTask,versions:vs.slice(0,30),runs:rs.slice(0,5),versionsNextBefore:vs.length>30?vs[29].revision:null,runsNextCursor:rs.length>5?cursorOf(rs[4]):null};
}
