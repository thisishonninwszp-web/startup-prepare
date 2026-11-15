'use server';
import {createClient} from '@/lib/supabase/server';
import {savePremise} from '@/lib/domains/premises/commands';
import {readPremises} from '@/lib/domains/premises/queries';
import {detailSchema,historyPageSchema,newsPageSchema,pageSchema,targetPageSchema,type PremiseCommand} from '@/lib/domains/premises/domain';
async function owner(){const {data:{user},error}=await createClient().auth.getUser();if(error||!user)throw new Error('请先登录，再读取或保存前提。');return user.id;}
export async function listPremisesAction(before?:string){return pageSchema.parse(await readPremises(await owner(),{operation:'list',...(before?{before}:{})}));}
export async function getPremiseAction(id:string){return detailSchema.parse(await readPremises(await owner(),{operation:'get',id}));}
export async function loadTargetsAction(targetKind:'idea'|'business_case'|'method',before?:string){return targetPageSchema.parse(await readPremises(await owner(),{operation:'targets',targetKind,...(before?{before}:{})}));}
export async function loadPremiseNewsAction(id:string,before?:string){return newsPageSchema.parse(await readPremises(await owner(),{operation:'news',id,...(before?{before}:{})}));}
export async function loadPremiseHistoryAction(id:string,before?:string){return historyPageSchema.parse(await readPremises(await owner(),{operation:'history',id,...(before?{before}:{})}));}
export async function mutatePremiseAction(input:PremiseCommand|unknown){try{return {ok:true as const,data:await savePremise(await owner(),input)};}catch(error){return {ok:false as const,message:error instanceof Error?error.message:'没有完成保存，请保留输入后重试。'};}}
