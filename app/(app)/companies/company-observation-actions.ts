'use server';
import {createClient} from '@/lib/supabase/server';
import * as commands from '@/lib/domains/observations/companies/commands';
import {listEntries,getIdentity,listSavedJobs,listOwnedIdeas,searchOwnedIdeas,pageSavedJobs,type CompanyIdeaSearchOptions,type CompanyJobPageOptions} from '@/lib/domains/observations/companies/queries';
import {companyObservationsEnabled,type CompanyEntry,type CompanyIdentityState} from '@/lib/domains/observations/companies/domain';
import type {SavedCompanyJob} from '@/lib/domains/observations/companies/queries';
async function viewer(){const {data:{user}}=await createClient().auth.getUser();if(!user)throw new Error('未登录');return user.id;}
async function write<T>(input:T,command:(userId:string,input:T)=>Promise<{id:string}>){try{const userId=await viewer();if(!companyObservationsEnabled())throw new Error('企业观察尚未开启');return {ok:true as const,...await command(userId,input)};}catch(error){return {ok:false as const,error:error instanceof Error?error.message:'保存失败'};}}
export async function confirmCompanyIdentity(input:commands.ConfirmIdentityInput){return write(input,commands.confirmIdentity);}
export async function clearCompanyIdentity(input:commands.ClearIdentityInput){return write(input,commands.clearIdentity);}
export async function saveCompanyActivity(input:commands.SaveActivityInput){return write(input,commands.saveActivity);}
export async function saveCompanySnapshot(input:commands.SaveSnapshotInput){return write(input,commands.saveSnapshot);}
export async function linkCompanyJob(input:commands.LinkSavedJobInput){return write(input,commands.linkSavedJob);}
export async function linkCompanyEntryToIdea(input:commands.LinkEntryInput){return write(input,commands.linkEntryToIdea);}
export async function loadCompanyObservations(companyId:string,cursor?:string):Promise<{status:'ready'|'disabled'|'missing-schema';items:CompanyEntry[];nextCursor:string|null;identity:CompanyIdentityState;jobs:{exact:SavedCompanyJob[];candidates:SavedCompanyJob[];exactNextCursor?:string|null;candidatesNextCursor?:string|null};ideas:{id:string;title:string}[]}>{const userId=await viewer();const empty={items:[],nextCursor:null,identity:{entryId:null,identity:null},jobs:{exact:[],candidates:[]},ideas:[]};if(!companyObservationsEnabled())return {status:'disabled',...empty};const entries=await listEntries(userId,companyId,cursor);if(entries.status==='missing-schema')return {status:'missing-schema',...empty};const [identity,jobs,ideas]=await Promise.all([getIdentity(userId,companyId),listSavedJobs(userId,companyId),listOwnedIdeas(userId)]);return {...entries,identity,jobs,ideas};}

export async function searchCompanyIdeas(companyId:string,options:CompanyIdeaSearchOptions){const userId=await viewer();if(!companyObservationsEnabled())throw new Error('企业观察尚未开启');return searchOwnedIdeas(userId,companyId,options);}
export async function pageCompanyJobs(companyId:string,options:CompanyJobPageOptions){const userId=await viewer();if(!companyObservationsEnabled())throw new Error('企业观察尚未开启');return pageSavedJobs(userId,companyId,options);}

