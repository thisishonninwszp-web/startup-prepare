import {requiredText,uuid} from './domain';
export type AccessStatus='public'|'partial'|'login_required'|'unavailable';
export type LearningOutcome='support'|'refute'|'unknown';
type Base={requestId:string;caseId:string};
export type IdentityInput=Base&{operation:'identity';expectedVersion:number;leftMerchantId:string;rightMerchantId:string;leftSource:string;rightSource:string;reason:string;confirmed:boolean;action:'link'|'revoke'};
export type ExpectationInput=Base&{operation:'expectation';reportId:string;baselineSnapshotId:string;question:string;scope:string;deadline:string;supportCriteria:string;refuteCriteria:string};
export type FollowupInput=Base&{operation:'followup';expectationId:string;snapshotId:string;outcome:LearningOutcome;quote:string;sameScopeConfirmed:boolean;scope:string;note:string;accessStatus:AccessStatus;coverage:'complete'|'insufficient'|'failed_fetch'|'list_absence'};
export type CorrectionInput=Base&{operation:'correction';snapshotId:string;explanation:string};
export type MethodInput=Base&{operation:'method';reportId:string;method:string;scenario:string;conditions:string;failureConditions:string;unknowns:string;confirmed:boolean;lessonId?:string};
export type LearningInput=IdentityInput|ExpectationInput|FollowupInput|CorrectionInput|MethodInput;
type DraftOf<T>=T extends LearningInput?Omit<T,'caseId'|'requestId'>:never;
export type LearningDraft=DraftOf<LearningInput>;
export type LearningEntry={id:string;operation:LearningInput['operation'];caseId:string;createdAt:string;payload:Record<string,unknown>;sourceInvalidated:boolean;reviewNeeded:boolean};
export type IdentityNotice={merchantId:string;name:string;platform:string;platformShopId:string;caseIds:string[]};
export type LearningState={available:boolean;version:number;items:LearningEntry[];nextCursor:string|null;merchants:IdentityNotice[];duplicateCaseIds:string[]};
export type MethodPage={available:boolean;items:LearningEntry[];nextCursor:string|null};
const operationKeys=['identity','expectation','followup','correction','method'];
function text(input:Record<string,unknown>,key:string,max=3000) {if(typeof input[key]!=='string')throw new Error('请填写 '+key);requiredText(input[key] as string,max);}
function identifier(input:Record<string,unknown>,key:string) {if(typeof input[key]!=='string')throw new Error('记录标识缺失');uuid(input[key] as string);}
export function validateLearningInput(value:unknown,checkNewDeadline=true):asserts value is LearningInput {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('无效学习记录');
 const input=value as Record<string,unknown>;
 if(typeof input.operation!=='string'||!operationKeys.includes(input.operation)||JSON.stringify(value).length>30000)throw new Error('无效学习记录');
 identifier(input,'requestId');identifier(input,'caseId');
 if('madeAt' in input||'createdAt' in input)throw new Error('创建时间由数据库记录，不可回填');
 switch(input.operation){
  case 'identity':
   identifier(input,'leftMerchantId');identifier(input,'rightMerchantId');
   if(input.leftMerchantId===input.rightMerchantId||input.confirmed!==true||!Number.isSafeInteger(input.expectedVersion)||(input.expectedVersion as number)<0||!['link','revoke'].includes(input.action as string))throw new Error('请确认两个不同店铺及当前关系版本');
   for(const k of ['leftSource','rightSource','reason'])text(input,k);break;
  case 'expectation':
   identifier(input,'reportId');identifier(input,'baselineSnapshotId');
   for(const k of ['question','scope','supportCriteria','refuteCriteria'])text(input,k);
   if(typeof input.deadline!=='string'||!Number.isFinite(Date.parse(input.deadline))||(checkNewDeadline&&Date.parse(input.deadline)<=Date.now()))throw new Error('截止时间必须在未来');break;
  case 'followup':
   identifier(input,'expectationId');identifier(input,'snapshotId');
   if(!['support','refute','unknown'].includes(input.outcome as string)||!['public','partial','login_required','unavailable'].includes(input.accessStatus as string)||!['complete','insufficient','failed_fetch','list_absence'].includes(input.coverage as string)||typeof input.sameScopeConfirmed!=='boolean'||typeof input.quote!=='string'||input.quote.length>12000)throw new Error('无效核对结果');
   text(input,'scope');text(input,'note');break;
  case 'correction':identifier(input,'snapshotId');text(input,'explanation',6000);break;
  case 'method':
   identifier(input,'reportId');if(input.lessonId!==undefined)identifier(input,'lessonId');
   for(const k of ['method','scenario','conditions','failureConditions','unknowns'])text(input,k,6000);
   if(input.confirmed!==true)throw new Error('只保存本人明确确认的方法');break;
 }
}
export function assessFollowup(input:Pick<FollowupInput,'outcome'|'sameScopeConfirmed'|'quote'|'accessStatus'|'coverage'>&{due:boolean;afterPrediction:boolean}):LearningOutcome {
 return input.due&&input.afterPrediction&&input.sameScopeConfirmed&&input.quote.trim()&&input.accessStatus==='public'&&input.coverage==='complete'?input.outcome:'unknown';
}
