'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createTask, updateTask, saveRun, attachRunToGap } from '@/lib/domains/observations/commands';
import type { CreateTaskInput,TaskConfig,RunInput } from '@/lib/domains/observations/domain';
import { listTasks,getTask,type TaskListOptions,type TaskDetailOptions } from '@/lib/domains/observations/queries';
async function userId(){
  if(process.env.DECISION_OBSERVATIONS_ENABLED!=='true')throw new Error('观察任务尚未启用');
  const {data:{user}}=await createClient().auth.getUser();if(!user)throw new Error('未登录');return user.id;
}
function refresh(){revalidatePath('/workbench');}
export async function createObservationTask(input:CreateTaskInput){const result=await createTask(await userId(),input);refresh();return result;}
export async function updateObservationTask(input:{taskId:string;config:TaskConfig;requestId:string}){const result=await updateTask(await userId(),input);refresh();return result;}
export async function saveObservationRun(input:{taskId:string;taskVersionId:string;requestId:string;run:RunInput}){const result=await saveRun(await userId(),input);refresh();return result;}
export async function attachObservationRun(input:{gapId:string;runId:string;requestId:string}){const result=await attachRunToGap(await userId(),input);refresh();return result;}
export async function loadObservationTasks(input:TaskListOptions={}){return listTasks(await userId(),input);}
export async function loadObservationTask(taskId:string,options:TaskDetailOptions={}){return getTask(await userId(),taskId,options);}
