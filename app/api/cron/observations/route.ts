import {NextResponse} from 'next/server';
import {schedulingEnabled} from '@/lib/domains/observations/scheduling/domain';
import {runScheduledObservations} from '@/lib/domains/observations/scheduling/run';
export const maxDuration=180;
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET;if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return NextResponse.json({error:'Unauthorized'},{status:401});
 if(!schedulingEnabled())return NextResponse.json({error:'scheduler_disabled'},{status:503});
 try{const data=await runScheduledObservations({limit:3});return NextResponse.json(data,{status:data.failed||data.discarded?502:200});}
 catch(error){const code=error instanceof Error&&['credential_unavailable','scheduler_disabled'].includes(error.message)?error.message:'scheduler_unavailable';return NextResponse.json({error:code},{status:503});}
}
