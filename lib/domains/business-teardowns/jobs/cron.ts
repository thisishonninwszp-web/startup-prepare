import {supabaseAdmin} from '@/lib/supabase';
import {executeBusinessJob} from './executor';
export async function runBusinessJobs():Promise<{failed:number;results:{owner:string;status:string;message?:string|null}[]}>{
 const results:{owner:string;status:string;message?:string|null}[]=[];
 for(let offset=0;;offset+=100){
  const {data,error}=await supabaseAdmin.from('business_job_settings').select('user_id').order('user_id').range(offset,offset+99);
  if(error)throw new Error(error.message);
  for(const row of data??[]){try{const result=await executeBusinessJob(row.user_id,'cron');results.push({owner:row.user_id,status:result.status,...(result.message?{message:result.message}:{})});}catch(error){results.push({owner:row.user_id,status:'error',message:error instanceof Error?error.message:'worker unavailable'});}}
  if(!data||data.length<100)break;
 }
 return {failed:results.filter(r=>['failed','unknown','error'].includes(r.status)).length,results};
}
