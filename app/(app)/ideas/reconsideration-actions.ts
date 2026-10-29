"use server";
import {revalidatePath} from 'next/cache';
import {createClient} from '@/lib/supabase/server';
import * as commands from '@/lib/domains/observations/feedback/reconsideration-commands';
import * as queries from '@/lib/domains/observations/feedback/reconsideration-queries';
import type {SaveReconsiderationInput,ReconsiderationWriteInput,EvaluateReconsiderationInput,AcknowledgeReconsiderationInput} from '@/lib/domains/observations/feedback/reconsideration-domain';
async function viewer(){const {data:{user}}=await createClient().auth.getUser();if(!user)throw new Error('未登录');if(process.env.FEEDBACK_LEARNING_ENABLED!=='true')throw new Error('反馈学习尚未开启');return user.id;}
async function write<T>(input:T,fn:(userId:string,input:T)=>Promise<{id:string}>){try{const result=await fn(await viewer(),input);revalidatePath('/ideas/[id]','page');revalidatePath('/workbench');revalidatePath('/learnings');return {ok:true as const,...result};}catch(error){return {ok:false as const,message:error instanceof Error?error.message:'保存失败'};}}
export async function saveReconsiderationConditionAction(input:SaveReconsiderationInput){return write(input,commands.saveReconsiderationCondition);}
export async function retractReconsiderationConditionAction(input:ReconsiderationWriteInput){return write(input,commands.retractReconsiderationCondition);}
export async function evaluateReconsiderationAction(input:EvaluateReconsiderationInput){return write(input,commands.evaluateReconsideration);}
export async function acknowledgeReconsiderationAction(input:AcknowledgeReconsiderationInput){return write(input,commands.acknowledgeReconsideration);}
export async function loadReconsiderationAction(ideaId:string,cursor?:string){try{return {ok:true as const,data:await queries.loadReconsideration(await viewer(),ideaId,cursor)};}catch(error){return {ok:false as const,message:error instanceof Error?error.message:'读取失败'};}}
export async function loadReconsiderationCuesAction(cursor?:string){try{return {ok:true as const,data:await queries.loadReconsiderationCues(await viewer(),cursor)};}catch(error){return {ok:false as const,message:error instanceof Error?error.message:'读取失败'};}}

