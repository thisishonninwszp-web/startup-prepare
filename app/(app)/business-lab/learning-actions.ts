'use server';
import {createClient} from '@/lib/supabase/server';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {saveBusinessLearning} from '@/lib/domains/business-teardowns/learning-commands';
import {loadBusinessLearning,searchBusinessMethods} from '@/lib/domains/business-teardowns/learning-queries';
import {validateLearningInput,type LearningInput} from '@/lib/domains/business-teardowns/learning-domain';
import {buildDatedManualSource,type DatedManualSourceInput} from '@/lib/domains/business-teardowns/manual-sources';
import {loadCaseDetail} from '@/lib/domains/business-teardowns/queries';
import {uuid,requiredText} from '@/lib/domains/business-teardowns/domain';
import {findBusinessReceipt,saveCaseMaterial,semanticInputHash,prepareBusinessCase} from '@/lib/domains/business-teardowns/commands';
async function owner(){if(!businessTeardownsEnabled())throw new Error('生意拆解尚未开启');const {data:{user}}=await createClient().auth.getUser();if(!user)throw new Error('未登录');return user.id;}
export async function loadLearningAction(caseId:string,before?:string){return loadBusinessLearning(await owner(),caseId,before);}
export async function saveLearningAction(input:LearningInput){const userId=await owner();validateLearningInput(input,false);if(!await loadCaseDetail(userId,input.caseId))throw new Error('案例不存在或无权操作');return saveBusinessLearning(userId,input);}
export async function searchMethodsAction(query:string,before?:string){return searchBusinessMethods(await owner(),query,before);}
export type SaveDatedMaterialInput=DatedManualSourceInput&{requestId:string;selectionReason:string;caseId?:string;expectedRevision?:number;role?:'product'|'comparison'};
export async function saveDatedManualSourceAction(input:SaveDatedMaterialInput){
 const userId=await owner();uuid(input.requestId);requiredText(input.selectionReason,2000);
 const material=buildDatedManualSource(input);
 const operation=input.caseId?'attach':'primary';
 if(input.caseId){uuid(input.caseId);if(!Number.isSafeInteger(input.expectedRevision)||(input.expectedRevision??0)<1||!['product','comparison'].includes(input.role??''))throw new Error('请指定材料角色及案例版本');}
 const frozen={...material,selectionReason:input.selectionReason,...(operation==='attach'?{caseId:input.caseId,expectedRevision:input.expectedRevision,role:input.role}:{})};
 const userInputHash=semanticInputHash({kind:'dated_manual',...frozen});
 const prior=await findBusinessReceipt(userId,{requestId:input.requestId,operation,userInputHash});if(prior)return prior;
 if(input.caseId){const detail=await loadCaseDetail(userId,input.caseId);if(!detail)throw new Error('案例不存在或无权操作');if(detail.dailyCase.revision!==input.expectedRevision)throw new Error('材料版本已变化，请先刷新');
  const same=detail.merchant.platform===material.merchant.platform&&detail.merchant.platformShopId===material.merchant.platformShopId;
  if((input.role==='product')!==same)throw new Error('只有同平台同店材料可作为主店商品；其他店必须明确选择对照');
 }else{const prepared=await prepareBusinessCase(userId,{requestId:input.requestId,userInputHash,merchant:material.merchant,selectionReason:input.selectionReason});if(!prepared.needsMaterial)return prepared.dailyCase;}
 return saveCaseMaterial(userId,{...frozen,operation,requestId:input.requestId,userInputHash});
}
