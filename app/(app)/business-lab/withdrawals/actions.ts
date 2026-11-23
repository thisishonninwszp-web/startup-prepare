'use server';
import {createClient} from '@/lib/supabase/server';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {withdrawalCommand,withdrawalRead} from '@/lib/domains/business-teardowns/withdrawals/transport';
import {withdrawalCommandSchema,withdrawalUuid,type WithdrawalCommand} from '@/lib/domains/business-teardowns/withdrawals/domain';
async function owner(){if(!businessTeardownsEnabled())throw new Error('退出教材尚未开启');const {data:{user}}=await createClient().auth.getUser();if(!user)throw new Error('请先登录');return user.id;}
export async function loadWithdrawalsAction(input:{before?:string}={}){return withdrawalRead(await owner(),'list',input);}
export async function loadWithdrawalIssuersAction(input:{before?:string}={}){return withdrawalRead(await owner(),'issuers',input);}
export async function loadWithdrawalAction(id:string){return withdrawalRead(await owner(),'get',{id:withdrawalUuid.parse(id)});}
export async function loadWithdrawalTodayAction(){return withdrawalRead(await owner(),'today',{});}
export async function withdrawalCommandAction(input:WithdrawalCommand){const user=await owner();return withdrawalCommand(user,withdrawalCommandSchema.parse(input));}
