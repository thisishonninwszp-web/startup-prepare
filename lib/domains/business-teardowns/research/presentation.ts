import type {ResearchKind,SourceInput,ResearchRecord} from './domain';

export const RESEARCH_LABELS:Record<ResearchKind,string>={failure:'失败档案（退出与收缩）',comparison:'经营结构对照',tension:'需求矛盾地图',apprenticeship:'创业学徒路线'};
export const DIMENSIONS=[['buyer','购买者'],['user','使用者'],['payer','付款者'],['trigger','触发场景'],['delivery','交付方式'],['alternative','替代办法']] as const;

export type Receipt={key:string;requestId:string};
export type EditorIdentity={id:string;epoch:number};
export function researchEditorTransition(current:EditorIdentity|null,requested:EditorIdentity,result:{record:ResearchRecord|null}|{error:true}):'ignore'|'hide'|'clear'|'preserve'{
 if(!current||current.id!==requested.id||current.epoch!==requested.epoch)return 'ignore';
 if('error' in result)return 'hide';
 const record=result.record;
 return !record||record.id!==requested.id||record.invalidated||record.experienceInvalidated||record.erasedAt||!record.payload||record.sources.some(source=>source.invalidated)?'clear':'preserve';
}
export function researchRequestReceipt(previous:Receipt|null,input:unknown,uuid:()=>string=()=>crypto.randomUUID()):Receipt{const key=JSON.stringify(input);return previous?.key===key?previous:{key,requestId:uuid()};}

export function researchPublicUrl(value:string|null):string|null{if(!value)return null;try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.toString():null;}catch{return null;}}

const text=(data:FormData,key:string)=>String(data.get(key)??'').trim();
export function buildResearchPayload(kind:ResearchKind,data:FormData,sources:SourceInput[]):Record<string,unknown>{
 const values=(keys:string[])=>Object.fromEntries(keys.map(key=>[key,text(data,key)]));
 if(kind==='failure')return {...values(['event','when','scope','disclosureKey','whatChanged','alternative','condition','checkNext']),confirmedDisclosure:data.get('confirmedDisclosure')==='on'};
 if(kind==='comparison')return {dimensions:DIMENSIONS.map(([key])=>({key,left:text(data,`${key}.left`),right:text(data,`${key}.right`),leftSourceKey:text(data,`${key}.leftSourceKey`)||null,rightSourceKey:text(data,`${key}.rightSourceKey`)||null})),...values(['hypothesis','counterexample','checkNext'])};
 if(kind==='tension')return values(['task','leftNeed','rightNeed','leftSourceKey','rightSourceKey','tradeoff','alternative','checkNext']);
 const sourceKey=text(data,'jobSourceKey'),job=sources.find(s=>s.key===sourceKey&&s.kind==='job');
 if(sourceKey&&!job)throw new Error('岗位出处不存在，请重新选择');
 if(job&&(!text(data,'rationale')||!text(data,'employerQuestion')))throw new Error('请填写岗位联系及仍须向雇主确认的问题');
 return {...values(['mechanism','timeBudget','cashBudget','gap','practice','checkNext']),constraintsConfirmed:data.get('constraintsConfirmed')==='on',jobLink:job?{jobId:job.id,sourceKey,rationale:text(data,'rationale'),employerQuestion:text(data,'employerQuestion')}:null};
}
