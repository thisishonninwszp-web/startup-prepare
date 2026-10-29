'use server';
import {createClient} from '@/lib/supabase/server';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {requiredText,uuid,type DailyCase} from '@/lib/domains/business-teardowns/domain';
import {findBusinessReceipt,saveCaseMaterial,semanticInputHash,prepareBusinessCase,failBusinessPreparation} from '@/lib/domains/business-teardowns/commands';
import {loadDailyCase,loadCaseDetail,listCaseHistory} from '@/lib/domains/business-teardowns/queries';
import {inspectRakutenItem,searchBusinessCandidates as searchCandidates,type BusinessSearchInput} from '@/lib/domains/business-teardowns/providers/rakuten';
import {buildManualMaterial,type ManualMaterialInput} from '@/lib/domains/business-teardowns/providers/manual';
async function owner():Promise<string> {
 if(!businessTeardownsEnabled())throw new Error('生意拆解尚未开启');
 const {data:{user}}=await createClient().auth.getUser();if(!user)throw new Error('未登录');return user.id;
}
function request(input:{requestId:string;selectionReason:string}) {uuid(input.requestId);requiredText(input.selectionReason,2000);}
type OfficialInput={requestId:string;shopCode:string;itemCode:string;selectionReason:string};
type ManualInput=ManualMaterialInput&{requestId:string;selectionReason:string};
type Attachment={caseId:string;expectedRevision:number};
function attachment(input:Attachment) {uuid(input.caseId);if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1)throw new Error('无效案例版本');}
function manualFields(input:ManualInput):ManualMaterialInput {
 requiredText(input.platformShopId,180);requiredText(input.name,200);requiredText(input.sourceUrl,2000);requiredText(input.capturedText,12000);requiredText(input.coverage,1000);
 return {platform:input.platform,platformShopId:input.platformShopId,name:input.name,sourceUrl:input.sourceUrl,capturedText:input.capturedText,coverage:input.coverage,publishedAt:input.publishedAt??null};
}
async function requireAttachmentOwner(userId:string,input:Attachment) {
 const detail=await loadCaseDetail(userId,input.caseId);if(!detail)throw new Error('案例不存在或无权操作');if(detail.dailyCase.revision!==input.expectedRevision)throw new Error('案例已更新，请先刷新');return detail;
}
function officialFields(input:OfficialInput) {requiredText(input.shopCode,180);requiredText(input.itemCode,400);if(!/^[a-zA-Z0-9_-]+$/.test(input.shopCode)||!input.itemCode.startsWith(`${input.shopCode}:`)||input.itemCode.length<=input.shopCode.length+1)throw new Error('商品不属于该店铺');return {shopCode:input.shopCode,itemCode:input.itemCode,selectionReason:input.selectionReason};}
export async function searchBusinessCandidates(input:Omit<BusinessSearchInput,'beforeRequest'>) {
 await owner();return searchCandidates({mode:input.mode,keyword:input.keyword,shopCode:input.shopCode,genreId:input.genreId,page:input.page,period:input.period,age:input.age,sex:input.sex});
}
export async function selectBusinessCandidate(input:OfficialInput):Promise<DailyCase> {
 const userId=await owner();request(input);const selected=officialFields(input);const userInputHash=semanticInputHash({kind:'official',...selected});
 const prior=await findBusinessReceipt(userId,{requestId:input.requestId,operation:'primary',userInputHash});if(prior)return prior;
 const prepared=await prepareBusinessCase(userId,{requestId:input.requestId,userInputHash,selectionReason:input.selectionReason,merchant:{platform:'rakuten',platformShopId:input.shopCode,name:`${input.shopCode}（待接口核对）`,sourceUrl:`https://www.rakuten.co.jp/${input.shopCode}/`,identityScope:'user_supplied_unverified'}});if(!prepared.needsMaterial)return prepared.dailyCase;
 let material:Awaited<ReturnType<typeof inspectRakutenItem>>;
 try {material=await inspectRakutenItem(input.itemCode,{shopCode:input.shopCode});}
 catch(error) {await failBusinessPreparation(userId,{requestId:input.requestId,userInputHash});throw error;}
 return saveCaseMaterial(userId,{...material,operation:'primary',requestId:input.requestId,userInputHash,selectionReason:input.selectionReason});
}
export async function createManualBusinessCase(input:ManualInput):Promise<DailyCase> {
 const userId=await owner();request(input);const fields=manualFields(input);const userInputHash=semanticInputHash({kind:'manual',...fields,selectionReason:input.selectionReason});
 const prior=await findBusinessReceipt(userId,{requestId:input.requestId,operation:'primary',userInputHash});if(prior)return prior;
 const material=buildManualMaterial(fields);
 const prepared=await prepareBusinessCase(userId,{requestId:input.requestId,userInputHash,merchant:material.merchant,selectionReason:input.selectionReason});if(!prepared.needsMaterial)return prepared.dailyCase;
 return saveCaseMaterial(userId,{...material,operation:'primary',requestId:input.requestId,userInputHash,selectionReason:input.selectionReason});
}
export async function attachBusinessComparison(input:OfficialInput&Attachment):Promise<DailyCase> {
 const userId=await owner();request(input);attachment(input);const fields=officialFields(input);const userInputHash=semanticInputHash({kind:'official',...fields,caseId:input.caseId,expectedRevision:input.expectedRevision,role:'comparison'});
 const prior=await findBusinessReceipt(userId,{requestId:input.requestId,operation:'attach',userInputHash});if(prior)return prior;
 await requireAttachmentOwner(userId,input);
 const material=await inspectRakutenItem(input.itemCode,{shopCode:input.shopCode});return saveCaseMaterial(userId,{...material,operation:'attach',requestId:input.requestId,userInputHash,caseId:input.caseId,expectedRevision:input.expectedRevision,role:'comparison',selectionReason:input.selectionReason});
}
export async function attachManualBusinessMaterial(input:ManualInput&Attachment&{role:'product'|'comparison'}):Promise<DailyCase> {
 const userId=await owner();request(input);attachment(input);if(!['product','comparison'].includes(input.role))throw new Error('无效材料角色');const fields=manualFields(input);const userInputHash=semanticInputHash({kind:'manual',...fields,selectionReason:input.selectionReason,caseId:input.caseId,expectedRevision:input.expectedRevision,role:input.role});
 const prior=await findBusinessReceipt(userId,{requestId:input.requestId,operation:'attach',userInputHash});if(prior)return prior;
 await requireAttachmentOwner(userId,input);
 const material=buildManualMaterial(fields);return saveCaseMaterial(userId,{...material,operation:'attach',requestId:input.requestId,userInputHash,caseId:input.caseId,expectedRevision:input.expectedRevision,role:input.role,selectionReason:input.selectionReason});
}
export async function loadBusinessCaseAction(input:{caseId:string}) {return loadCaseDetail(await owner(),input.caseId);}
export async function loadBusinessHistoryAction(input:{before?:string}) {return listCaseHistory(await owner(),input.before);}
export async function loadTodayBusinessCaseAction() {const userId=await owner();const today=await loadDailyCase(userId);return today?loadCaseDetail(userId,today.id):null;}
