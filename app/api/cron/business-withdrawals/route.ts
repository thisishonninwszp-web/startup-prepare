import {NextResponse} from 'next/server';
import {runWithdrawalCron} from '@/lib/domains/business-teardowns/withdrawals/collection/cron';
export const dynamic='force-dynamic';
export const maxDuration=180;
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET;if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return NextResponse.json({error:'Unauthorized'},{status:401});
 try{const result=await runWithdrawalCron();return NextResponse.json(result,{status:['failed','unknown'].includes(result.collection.status)?502:200});}
 catch{return NextResponse.json({error:'withdrawal_collection_unavailable'},{status:503});}
}
