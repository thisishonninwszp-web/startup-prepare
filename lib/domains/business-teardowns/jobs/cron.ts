import {businessJobOwner} from './owner';
import {executeBusinessJob} from './executor';
export async function runBusinessJobs():Promise<{failed:number;results:{owner:string;status:string;message?:string|null}[]}>{
 const owner=await businessJobOwner();
 if(!owner)throw new Error('每日生意任务未配置主账号 IDEAOS_USER_EMAIL');
 try{
  const result=await executeBusinessJob(owner,'cron');
  return {failed:['failed','unknown','error','schema_required','owner_only'].includes(result.status)?1:0,results:[{owner,status:result.status,...(result.message?{message:result.message}:{})}]};
 }catch(error){return {failed:1,results:[{owner,status:'error',message:error instanceof Error?error.message:'worker unavailable'}]};}
}
