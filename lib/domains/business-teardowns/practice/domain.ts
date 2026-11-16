import {z} from 'zod';

export const practiceUuid=z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,'记录标识不正确').toLowerCase();
const text=z.string().trim().min(1,'请先写下这一项').max(3000);
const minutes=z.number().int().min(0).max(10080);
export const authoredPlanSchema=z.object({title:text.max(300),objective:text,deliverable:text,checkMethod:text,plannedMinutes:minutes.min(1),constraints:text}).strict();
export const practicePlanSchema=authoredPlanSchema.extend({caseId:practiceUuid,reportId:practiceUuid.nullable(),apprenticeshipId:practiceUuid.nullable()}).strict();
export const practiceResultSchema=z.object({artifactDescription:text,artifactUrl:z.string().max(2000).url().refine(v=>/^https?:\/\//.test(v),'只接受 HTTP(S) 链接').nullable(),actualMinutes:minutes,obstacle:text,nextChange:text}).strict();
const base={id:practiceUuid,requestId:practiceUuid,expectedRevision:z.number().int().min(0).max(2147483646)};
const commandSchema=z.discriminatedUnion('operation',[
 z.object({...base,operation:z.literal('plan'),plan:practicePlanSchema}).strict(),
 z.object({...base,operation:z.literal('result'),expectedRevision:base.expectedRevision.min(1),result:practiceResultSchema}).strict(),
 z.object({...base,operation:z.literal('erase'),expectedRevision:base.expectedRevision.min(1)}).strict(),
]);
export type PracticePlan=z.infer<typeof practicePlanSchema>;
export type AuthoredPracticePlan=z.infer<typeof authoredPlanSchema>;
export type PracticeResult=z.infer<typeof practiceResultSchema>;
export type PracticeCommand=z.infer<typeof commandSchema>;
export function parsePracticeCommand(value:unknown):PracticeCommand{return commandSchema.parse(value);}
export type PracticeSources={caseAvailable:boolean;caseTitle:string|null;reportAvailable:boolean;reportRevision:number|null;apprenticeshipAvailable:boolean;apprenticeshipTitle:string|null};
export type PracticeRecord={id:string;plan:PracticePlan;result:PracticeResult|null;resultPlan:AuthoredPracticePlan|null;resultPlanRevision:number|null;revision:number;planRevision:number;createdAt:string;updatedAt:string;sources:PracticeSources};
export type PracticeList={available:boolean;items:PracticeRecord[];nextCursor:string|null};
export type PracticeCase={id:string;title:string;date:string};
export type PracticeApprenticeship={id:string;title:string};
export type PracticePage<T>={items:T[];nextCursor:string|null};
export type PracticeContext={caseId:string;caseTitle:string;reportId:string|null;reportRevision:number|null}|null;
export type PracticeTemplate='quotation'|'suppliercomparison'|'orderprototype'|'custom';
export const PRACTICE_TEMPLATES:readonly [PracticeTemplate,string][]=[['quotation','报价单'],['suppliercomparison','进货比较表'],['orderprototype','接单流程原型'],['custom','自定制作物']];
export function practiceTemplate(kind:PracticeTemplate):AuthoredPracticePlan{
 const common={plannedMinutes:45,constraints:'先写清你可投入的时间、工具与费用上限。练习中的假设数要标明，未知事实留待核对。'};
 switch(kind){
  case 'quotation':return {...common,title:'制作一张练习报价单',objective:'找出报价时容易遗漏的交付范围与条件',deliverable:'一张列出交付项、不包含事项、假设与待核对项目的报价单',checkMethod:'用一个明确标为虚构的订单逐项走查，记下无法报价的部分'};
  case 'suppliercomparison':return {...common,title:'制作一张进货比较表',objective:'找出选择供货方式前还缺哪些资料',deliverable:'一张写清比较项、资料出处与待核对项的空表或练习表',checkMethod:'检查价格单位、最小起订量与交付条件能否比较；没有出处的项目留空'};
  case 'orderprototype':return {...common,title:'制作一个接单流程原型',objective:'暴露接单到交付之间的遗漏与返工点',deliverable:'一份能逐步走完的流程草图，标出异常情况与仍需确认的环节',checkMethod:'用一个明确标为虚构的订单走完整个流程，记录卡住的位置'};
  case 'custom':return {...common,title:'制作一件可检查的东西',objective:'写下这次亲手制作要暴露的具体缺口',deliverable:'写下别人能打开、看见或操作的成果物',checkMethod:'写下怎样检查成果是否满足本次要求'};
 }
}
export type PracticeReceipt={signature:string;requestId:string};
export function practiceReceipt(previous:PracticeReceipt|null,input:unknown,newId:()=>string):PracticeReceipt{const signature=JSON.stringify(input);return previous?.signature===signature?previous:{signature,requestId:newId()};}
export function parsePracticeStart(params:{caseId?:string|string[];apprenticeshipId?:string|string[]}):{caseId?:string;apprenticeshipId?:string}{
 const result:{caseId?:string;apprenticeshipId?:string}={};for(const key of ['caseId','apprenticeshipId'] as const){const parsed=practiceUuid.safeParse(params[key]);if(parsed.success)result[key]=parsed.data;}return result;
}
export function practiceVerifyTransition(base:{id:string;revision:number},incoming:{id:string;revision:number}|null,comparisonPending=false):'missing'|'conflict'|'refresh'{
 if(!incoming||incoming.id!==base.id)return 'missing';
 return comparisonPending||incoming.revision!==base.revision?'conflict':'refresh';
}
export function practiceOutcomeAfterSave(operation:'plan'|'result',draft:PracticeResult,saved:PracticeResult|null):PracticeResult{
 return operation==='plan'?draft:saved??draft;
}
export function practiceCreateRecoveryMatches(command:PracticeCommand,record:Pick<PracticeRecord,'id'|'revision'|'plan'>):boolean{
 if(command.operation!=='plan'||command.expectedRevision!==0||record.id!==command.id||record.revision!==command.expectedRevision+1)return false;
 return JSON.stringify(practicePlanSchema.parse(command.plan))===JSON.stringify(practicePlanSchema.parse(record.plan));
}
