'use server';
import {createClient} from '@/lib/supabase/server';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {loadBusinessJobState,saveBusinessJobSettings,jobCommand} from '@/lib/domains/business-teardowns/jobs/commands';
import {executeBusinessJob} from '@/lib/domains/business-teardowns/jobs/executor';
import type {JobSettings,JobLease} from '@/lib/domains/business-teardowns/jobs/types';
async function owner(){if(!businessTeardownsEnabled())throw new Error('生意拆解尚未开启');const {data:{user}}=await createClient().auth.getUser();if(!user)throw new Error('未登录');return user.id;}
export async function loadBusinessJobStateAction(){return loadBusinessJobState(await owner());}
export async function saveBusinessJobSettingsAction(input:JobSettings&{expectedRevision:number;requestId:string;autoAIConfirmed?:boolean}){return saveBusinessJobSettings(await owner(),input);}
export async function prepareBusinessTodayAction(input:{trigger:'manual'|'open'}){if(!['manual','open'].includes(input.trigger))throw new Error('无效任务入口');return executeBusinessJob(await owner(),input.trigger);}
export async function loadBusinessJobHistoryAction(input:{before?:string}){if(input.before&&!/^\d{4}-\d{2}-\d{2}$/.test(input.before))throw new Error('无效历史日期');return jobCommand<{items:JobLease[];nextCursor:string|null}>(await owner(),'history',input);}
