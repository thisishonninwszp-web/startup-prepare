import {supabaseAdmin} from '@/lib/supabase';
import {uuid} from '../domain';
import {rakutenKeys} from '@/lib/rakuten';
import {DEFAULT_JOB_SETTINGS,type JobState,type JobSettings} from './types';
import {validateJobSettings} from './settings';
export async function jobCommand<T>(owner:string,operation:string,input:object={}):Promise<T>{uuid(owner);const {data,error}=await supabaseAdmin.rpc('business_job_command',{p_user_id:owner,p_operation:operation,p_input:input});if(error)throw Object.assign(new Error(error.message),{code:error.code});return data as T;}
export async function loadBusinessJobState(owner:string):Promise<JobState>{
 try{return {...await jobCommand<JobState>(owner,'state'),credentialAvailable:rakutenKeys()!==null};}catch(error){if(error&&typeof error==='object'&&'code'in error&&['42P01','42883','PGRST202','PGRST205'].includes(String(error.code)))return {available:false,settings:DEFAULT_JOB_SETTINGS,run:null,attempts:[],candidates:[],history:{excluded:[],priorMain:[],recent:[]}};throw error;}
}
export function saveBusinessJobSettings(owner:string,input:JobSettings&{expectedRevision:number;requestId:string;autoAIConfirmed?:boolean}):Promise<JobSettings>{validateJobSettings(input);return jobCommand(owner,'settings',input);}
export function businessJobsEnabled():boolean{return process.env.BUSINESS_TEARDOWNS_ENABLED==='true'&&process.env.BUSINESS_TEARDOWNS_JOBS_ENABLED==='true';}
