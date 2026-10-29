'use server';
import {revalidatePath} from 'next/cache';
import {createClient} from '@/lib/supabase/server';
import {saveFeedback,saveFeedbackLink} from '@/lib/domains/observations/feedback/commands';
import {loadFeedbackBundle,listFeedbackLinks,searchFeedbackIdeas,listFeedbackValidations,getFeedback,getLatestFeedbackLink} from '@/lib/domains/observations/feedback/queries';
import type {FeedbackInput,FeedbackLinkInput} from '@/lib/domains/observations/feedback/domain';
async function viewer(){const {data:{user}}=await createClient().auth.getUser();if(!user)throw new Error('未登录');if(process.env.FEEDBACK_LEARNING_ENABLED!=='true')throw new Error('反馈学习功能尚未开启');return user.id;}
async function write<T>(input:T,command:(userId:string,input:T)=>Promise<{id:string}>){try{const result=await command(await viewer(),input);for(const path of ['/workbench','/ideas','/learning'])revalidatePath(path);revalidatePath('/ideas/[id]','page');return {ok:true as const,...result};}catch(error){return {ok:false as const,message:error instanceof Error?error.message:'保存失败'};}}
async function read<T>(query:(userId:string)=>Promise<T>){try{return {ok:true as const,data:await query(await viewer())};}catch(error){return {ok:false as const,message:error instanceof Error?error.message:'读取失败'};}}
export async function saveFeedbackAction(input:FeedbackInput){return write(input,saveFeedback);}
export async function saveFeedbackLinkAction(input:FeedbackLinkInput){return write(input,saveFeedbackLink);}
export async function loadFeedbackAction(ideaId?:string,before?:number){return read(userId=>loadFeedbackBundle(userId,ideaId,before));}
export async function loadFeedbackLinksAction(options:{feedbackId?:string;targetIdeaId?:string;before?:number}={}){return read(userId=>listFeedbackLinks(userId,options));}
export async function loadFeedbackEntryAction(feedbackId:string){return read(userId=>getFeedback(userId,feedbackId));}
export async function loadLatestFeedbackLinkAction(feedbackId:string,targetIdeaId:string){return read(userId=>getLatestFeedbackLink(userId,feedbackId,targetIdeaId));}
export async function searchFeedbackIdeasAction(search='',cursor?:string){return read(userId=>searchFeedbackIdeas(userId,search,cursor));}
export async function loadFeedbackValidationsAction(ideaId:string,cursor?:string){return read(userId=>listFeedbackValidations(userId,ideaId,cursor));}
