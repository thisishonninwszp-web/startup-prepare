'use server';
import {createClient} from '@/lib/supabase/server';
import {businessJobOwner} from '@/lib/domains/business-teardowns/jobs/owner';
import {loadCollectionState,saveCollectionSettings,withdrawalCollectionEnabled} from '@/lib/domains/business-teardowns/withdrawals/collection/transport';
import {executeWithdrawalCollection} from '@/lib/domains/business-teardowns/withdrawals/collection/executor';
import {withdrawalRead} from '@/lib/domains/business-teardowns/withdrawals/transport';
import {collectionSettingsInputSchema,type CollectionSettingsInput} from '@/lib/domains/business-teardowns/withdrawals/collection/domain';
async function owner(){const {data:{user}}=await createClient().auth.getUser();if(!user)throw new Error('请先登录');if(await businessJobOwner()!==user.id)throw new Error('额外采集和诊断仅供主账号使用');return user.id;}
export async function loadWithdrawalCollectionAction(){const user=await owner();const state=await loadCollectionState(user);const issuers=await withdrawalRead(user,'issuers',{});return {state,issuers,globalEnabled:withdrawalCollectionEnabled()};}
export async function loadMoreCollectionIssuersAction(before:string){return withdrawalRead(await owner(),'issuers',{before});}
export async function saveWithdrawalCollectionSettingsAction(input:CollectionSettingsInput){return saveCollectionSettings(await owner(),collectionSettingsInputSchema.parse(input));}
export async function runWithdrawalCollectionAction(){return executeWithdrawalCollection(await owner());}
