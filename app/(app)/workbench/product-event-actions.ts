"use server";
import {createClient} from '@/lib/supabase/server';
import {mutateProductSource,linkProductEvent} from '@/lib/domains/observations/product-events/commands';
import {loadProductEvents} from '@/lib/domains/observations/product-events/queries';
import type {ProductSourceCommand,ProductEventLinkInput} from '@/lib/domains/observations/product-events/domain';
async function viewer(){if(process.env.PRODUCT_EVENTS_ENABLED!=='true')throw new Error('原型事件接入尚未开启');const {data:{user},error}=await createClient().auth.getUser();if(error||!user)throw new Error('请先登录');return user.id;}
function fail(e:unknown){return {ok:false as const,message:e instanceof Error?e.message:'操作未完成，输入与请求身份已保留'};}
export async function loadProductEventsAction(){try{return {ok:true as const,data:await loadProductEvents(await viewer())};}catch(e){return fail(e);}}
export async function mutateProductSourceAction(input:ProductSourceCommand){try{return {ok:true as const,data:await mutateProductSource(await viewer(),input)};}catch(e){return fail(e);}}
export async function linkProductEventAction(input:ProductEventLinkInput){try{return {ok:true as const,data:await linkProductEvent(await viewer(),input)};}catch(e){return fail(e);}}
