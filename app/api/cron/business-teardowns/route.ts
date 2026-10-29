import {NextResponse} from 'next/server';
import {businessJobsEnabled} from '@/lib/domains/business-teardowns/jobs/commands';
import {runBusinessJobs} from '@/lib/domains/business-teardowns/jobs/cron';
export const dynamic='force-dynamic';
export const maxDuration=180;
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET;if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return NextResponse.json({error:'Unauthorized'},{status:401});
 if(!businessJobsEnabled())return NextResponse.json({error:'business_jobs_disabled'},{status:503});
 try{const result=await runBusinessJobs();return NextResponse.json(result,{status:result.failed?502:200});}catch{return NextResponse.json({error:'business_jobs_unavailable'},{status:503});}
}
