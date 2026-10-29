'use server';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {approveStatistics,previewStatistics,refreshStatistics,deleteStatisticalSource,linkStatisticsIdea,type ApproveStatisticsInput,type StatisticalPreviewInput} from '@/lib/domains/observations/statistics/commands';
import {loadStatistics,loadStatisticalSnapshot} from '@/lib/domains/observations/statistics/queries';
import {fetchStatisticalMetadata} from '@/lib/domains/observations/statistics/provider';
import {statisticalPreviewHash,compareStatistics} from '@/lib/domains/observations/statistics/domain';
async function viewer(){if(process.env.STATISTICAL_DENOMINATORS_ENABLED!=='true')throw new Error('feature_disabled');const {data:{user}}=await createClient().auth.getUser();if(!user)throw new Error('not_signed_in');return user.id;}
function message(error:unknown){const code=error instanceof Error?error.message:'';const known:Record<string,string>={feature_disabled:'统计分母功能尚未开启。',not_signed_in:'请先登录。',credential_unavailable:'e-Stat 凭证未配置，不能在线获取或批准。',metadata_changed:'官方元数据已修订，原配置失效。请重新读取元数据、预览并确认新版本。',preview_changed:'数据或口径与预览不同，请重新预览后确认。',provider_request_failed:'官方来源请求未完成，请重试；错误不能解释为零。',source_not_approved:'该来源未处于当前批准状态，请重新确认。',select_every_dimension:'请从官方元数据选择每一个维度。',unknown_statistical_category:'所选分类不在当前官方元数据中，请重新选择。'};return known[code]||'统计操作未完成，请检查范围并重试；输入已保留。';}
async function read<T>(fn:(owner:string)=>Promise<T>){try{return {ok:true as const,data:await fn(await viewer())};}catch(error){return {ok:false as const,message:message(error)};}}
export async function loadStatisticsAction(before?:string){return read(owner=>loadStatistics(owner,before));}
export async function loadStatisticalMetadataAction(){return read(()=>fetchStatisticalMetadata());}
export async function previewStatisticsAction(input:StatisticalPreviewInput){return read(async()=>{const payload=await previewStatistics(input);return {payload,previewHash:statisticalPreviewHash(payload)};});}
export async function approveStatisticsAction(input:ApproveStatisticsInput&{confirmed:boolean}){return read(async owner=>{if(input.confirmed!==true)throw new Error('explicit_confirmation_required');return approveStatistics(owner,input);});}
export async function refreshStatisticsAction(input:{configId:string;requestId:string}){return read(owner=>refreshStatistics(owner,input));}
export async function deleteStatisticalSourceAction(input:{configId:string;requestId:string}){return read(owner=>deleteStatisticalSource(owner,input));}
export async function linkStatisticsIdeaAction(input:{configId:string;ideaId:string;scope:string;unknown:string;requestId:string}){return read(owner=>linkStatisticsIdea(owner,input));}
export async function compareStatisticsAction(input:{olderId:string;newerId:string}){return read(async owner=>{z.string().uuid().parse(input.olderId);z.string().uuid().parse(input.newerId);const[a,b]=await Promise.all([loadStatisticalSnapshot(owner,input.olderId),loadStatisticalSnapshot(owner,input.newerId)]);return compareStatistics(a.payload,b.payload);});}
