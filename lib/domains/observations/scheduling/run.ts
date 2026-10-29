import {loadApprovedStatisticalSource,invalidateStatisticalConfig} from '../statistics/commands';
import {runProvider} from '../statistics/provider';
import {claimSchedule,beginScheduleRequest,finishScheduleRun} from './commands';
import {schedulingEnabled} from './domain';
import {executeSchedules} from './executor';
export async function runScheduledObservations(options:{ownerId?:string;scheduleId?:string;limit?:number}={}){
 return executeSchedules({enabled:schedulingEnabled,credentials:()=>Boolean(process.env.ESTAT_APP_ID),claim:claimSchedule,beforeRequest:beginScheduleRequest,loadConfig:loadApprovedStatisticalSource,provider:runProvider,finish:finishScheduleRun,invalidate:invalidateStatisticalConfig},options);
}
