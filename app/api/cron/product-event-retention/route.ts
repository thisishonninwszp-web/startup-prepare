import {NextResponse} from 'next/server';
import {purgeExpiredProductEvents} from '@/lib/domains/observations/product-events/commands';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET;
 if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return NextResponse.json({error:'Unauthorized'},{status:401});
 if(process.env.PRODUCT_EVENTS_ENABLED!=='true')return NextResponse.json({enabled:false,erased:0});
 try{return NextResponse.json({enabled:true,...await purgeExpiredProductEvents(500)});}
 catch{return NextResponse.json({error:'事件保留清理未完成，请重试。'},{status:500});}
}
