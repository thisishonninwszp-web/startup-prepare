"use server";

import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { companyObservationsEnabled, type CompanyActivity, type CompanyIdentity } from "@/lib/domains/observations/companies/domain";
import { getIdentity, getRequestEntry } from "@/lib/domains/observations/companies/queries";
import { confirmTrustedIdentity, saveTrustedActivity, saveTrustedSnapshot } from "@/lib/domains/observations/companies/commands";
import { previewCompanyProvider, previewEdinetDocument, type ProviderPreview, type ProviderRequest } from "@/lib/domains/observations/companies/providers";
import { parseCompanyProviderImport } from "@/lib/domains/observations/companies/provider-imports";
import { snapshotDetails } from "@/lib/domains/observations/companies/comparison";
import { checkWindow } from "@/lib/domains/signals/events/windows";

export type CompanyProviderQuery = ProviderRequest | { provider:"manual"; corporateNumber:string; raw:string } | { provider:"edinet"; corporateNumber:string; documentId:string };
async function viewer(companyId:string) {
  if (!companyObservationsEnabled()) throw new Error("企业观察尚未开启。");
  const { data:{ user }, error } = await createClient().auth.getUser();
  if (error || !user) throw new Error("请先登录。");
  const identity = await getIdentity(user.id,companyId);
  return {userId:user.id,identity};
}
async function acquire(query:CompanyProviderQuery):Promise<ProviderPreview> {
  if (query.provider === "manual") return parseCompanyProviderImport(query.raw,query.corporateNumber);
  if (query.provider === "edinet") return previewEdinetDocument(query);
  return previewCompanyProvider({provider:query.provider,corporateNumber:query.corporateNumber,kind:query.kind});
}
function fingerprint(preview:ProviderPreview,index?:number):string {
  return createHash("sha256").update(JSON.stringify(index === undefined
    ? {provider:preview.provider,corporateNumber:preview.corporateNumber,legalName:preview.legalName,address:preview.address}
    : {provider:preview.provider,corporateNumber:preview.corporateNumber,record:preview.records[index]})).digest("hex");
}
function ready(preview:ProviderPreview) { if(preview.state !== "ready") throw new Error(preview.message || "来源暂不可用，没有保存新的企业事实。"); }
function intentProof(kind:string,input:unknown):string {
  const order=(v:unknown):unknown=>Array.isArray(v)?v.map(order):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,order(x)])):v;
  return createHash("sha256").update(JSON.stringify([kind,order(input)])).digest("hex");
}
async function replay(userId:string,companyId:string,requestId:string,kind:string,proof:string) {
  const saved=await getRequestEntry(userId,companyId,requestId);if(!saved)return null;
  const source=(kind==="identity"?(saved.payload.identity as {source?:{requestProof?:string}})?.source:saved.payload.source) as {requestProof?:string}|undefined;
  if(saved.kind!==kind||source?.requestProof!==proof)throw new Error("请求身份已用于不同内容，请重新核对。");
  return {id:saved.id};
}
export async function previewCompanyData(input:{companyId:string;query:CompanyProviderQuery}) {
  await viewer(input.companyId);
  const preview = await acquire(input.query);
  return {preview,identityFingerprint:preview.state === "ready" && preview.legalName && preview.address ? fingerprint(preview) : null,recordFingerprints:preview.records.map((_,i)=>fingerprint(preview,i))};
}
export async function confirmCompanyProviderIdentity(input:{companyId:string;requestId:string;expectedIdentityId:string|null;query:CompanyProviderQuery;expectedFingerprint:string}) {
  const {userId} = await viewer(input.companyId);const proof=intentProof("identity",input);const prior=await replay(userId,input.companyId,input.requestId,"identity",proof);if(prior)return prior;
  const preview=await acquire(input.query);ready(preview);
  if(!preview.legalName || !preview.address || fingerprint(preview)!==input.expectedFingerprint) throw new Error("身份资料已变化或不完整，请重新预览后确认。");
  const normalized=JSON.stringify({corporateNumber:preview.corporateNumber,legalName:preview.legalName,address:preview.address});
  const rawText=`${preview.rawExcerpt}\n\n规范化身份字段（接口/导入解析结果）：\n${normalized}`;
  const identity:CompanyIdentity={corporateNumber:preview.corporateNumber,legalName:preview.legalName,address:preview.address,source:{kind:preview.sourceType==="official_api"?"official_response":"manual_import",url:preview.sourceUrl,rawText,quote:normalized,requestProof:proof,scope:`${preview.coverage}；身份引文为解析后的规范化字段，并附原始响应摘录。${preview.sourceType==="user_imported"?"用户导入，未由官方在线核验。":""}`}};
  return confirmTrustedIdentity(userId,{companyId:input.companyId,requestId:input.requestId,expectedIdentityId:input.expectedIdentityId,identity});
}
export async function saveCompanyProviderRecord(input:{companyId:string;requestId:string;identityEntryId:string;query:CompanyProviderQuery;recordIndex:number;expectedFingerprint:string}) {
  const {userId,identity}=await viewer(input.companyId);
  const proof=intentProof("activity",input);const prior=await replay(userId,input.companyId,input.requestId,"activity",proof);if(prior)return prior;
  if(!identity.identity || identity.entryId!==input.identityEntryId || identity.identity.corporateNumber!==input.query.corporateNumber) throw new Error("当前企业身份已改变，请重新读取资料。");
  if(!Number.isSafeInteger(input.recordIndex)||input.recordIndex<0)throw new Error("请选择一条明确记录。");
  const preview=await acquire(input.query);ready(preview);const record=preview.records[input.recordIndex];
  if(!record||fingerprint(preview,input.recordIndex)!==input.expectedFingerprint)throw new Error("来源记录已变化，请重新预览，不能沿用旧选择。");
  const date=record.date&&/^\d{4}-\d{2}-\d{2}$/.test(record.date)&&Number.isFinite(Date.parse(record.date))&&new Date(record.date).toISOString().slice(0,10)===record.date?record.date:null;
  const activity:CompanyActivity={type:record.kind,stage:record.kind==="disclosure"?"announcement":"action",title:record.title,occurredOn:date,dateUnknown:date===null,
    source:{kind:preview.sourceType==="official_api"?"official_response":"manual_import",url:preview.sourceUrl,rawText:preview.rawExcerpt,quote:record.rawExcerpt,requestProof:proof,scope:`${preview.coverage}；来源字段摘录，不代表履约、经营效果或全市场需求。${preview.truncated?"本次返回有截取。":""}`},
    details:{amount:record.amount,currency:record.currency,publisher:record.publisher,sourceDate:record.date,corporateNumber:preview.corporateNumber,identityEntryId:identity.entryId,provider:preview.provider,sourceType:preview.sourceType}};
  return saveTrustedActivity(userId,{companyId:input.companyId,requestId:input.requestId,activity});
}
export async function captureCompanyPage(input:{companyId:string;url:string;marker:string}) {
  await viewer(input.companyId);
  if(input.url.length>2000||input.marker.length>300)throw new Error("网址或原文标记过长。");
  return checkWindow(input.url,input.marker);
}
export async function saveCapturedCompanySnapshot(input:{companyId:string;requestId:string;url:string;marker:string;expectedHash:string;activity:CompanyActivity}) {
  const {userId}=await viewer(input.companyId);const proof=intentProof("snapshot",input);const prior=await replay(userId,input.companyId,input.requestId,"snapshot",proof);if(prior)return prior;
  const captured=await checkWindow(input.url,input.marker);
  if(captured.status!=="success"||!captured.excerpt||!captured.hash)throw new Error("本次捕获未成功，没有保存价格或功能变化。");
  if(captured.hash!==input.expectedHash||captured.value?.startsWith("未找到"))throw new Error("网页已改变或没有找到原文标记，请重新读取后核对。");
  const quote=input.activity.source.quote;
  if(!quote||!captured.excerpt.includes(quote))throw new Error("摘录与实际捕获片段不一致，请重新选择原文。");
  const d=input.activity.details;
  const details=snapshotDetails({subject:d.subject,valueText:d.valueText,region:d.region,unit:d.unit,currency:d.currency},quote);
  return saveTrustedSnapshot(userId,{companyId:input.companyId,requestId:input.requestId,snapshot:{...input.activity,source:{kind:"web_capture",url:captured.url,rawText:captured.excerpt,quote,requestProof:proof,scope:"公开网页提取片段，最多600字符；源时区未知"},details:{...details,sourceHash:captured.hash}}});
}
