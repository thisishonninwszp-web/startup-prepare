import {z} from 'zod';

export const RESEARCH_KINDS=['failure','comparison','tension','apprenticeship'] as const;
export const DIMENSION_KEYS=['buyer','user','payer','trigger','delivery','alternative'] as const;
export type SourceKind='snapshot'|'material'|'job';
export type ResearchKind=typeof RESEARCH_KINDS[number];
export type SourceInput={key:string;kind:SourceKind;id:string;quote:string;publicConfirmed:boolean};
export type SourceOption={id:string;kind:SourceKind;title:string;text:string;url:string|null;date:string|null};
export type CaseOption={id:string;name:string;date:string};
export type ExperienceOption={id:string;label:string;text:string};
export type ResearchInput={id?:string;kind:ResearchKind;title:string;caseIds:string[];experienceIds:string[];sources:SourceInput[];payload:Record<string,unknown>;expectedRevision:number;requestId:string};
export type ResearchRecord={id:string;kind:ResearchKind;title:string;caseIds:string[];experienceIds:string[];payload:Record<string,unknown>|null;revision:number;createdAt:string;updatedAt:string;erasedAt:string|null;invalidated:boolean;experienceInvalidated:boolean;sources:(SourceInput&{url:string|null;date:string|null;invalidated:boolean})[]};
export type ResearchList={available:boolean;items:ResearchRecord[];nextCursor:string|null};
export const researchUuid=z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,'无效记录标识').toLowerCase();
const text=z.string().trim().min(1).max(3000);
const key=z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,31}$/,'来源键须为短 ASCII 标识');
const source=z.object({key,kind:z.enum(['snapshot','material','job']),id:researchUuid,quote:z.string().min(4).max(1600).refine(v=>v.trim().length>=4,'请选择至少四个字的逐字引文'),publicConfirmed:z.boolean()}).strict();
const failurePayload=z.object({event:z.enum(['exit','shrink','stop']),when:z.string().trim().max(3000),scope:z.enum(['company','store','product']),disclosureKey:key,confirmedDisclosure:z.literal(true),whatChanged:text,alternative:text,condition:text,checkNext:text}).strict();
const comparisonPayload=z.object({dimensions:z.array(z.object({key:z.enum(DIMENSION_KEYS),left:text,right:text,leftSourceKey:key.nullable(),rightSourceKey:key.nullable()}).strict()).length(6),hypothesis:text,counterexample:text,checkNext:text}).strict();
const tensionPayload=z.object({task:text,leftNeed:text,rightNeed:text,leftSourceKey:key,rightSourceKey:key,tradeoff:text,alternative:text,checkNext:text}).strict();
const apprenticeshipPayload=z.object({mechanism:text,timeBudget:text,cashBudget:text,constraintsConfirmed:z.literal(true),gap:text,practice:text,checkNext:text,jobLink:z.object({jobId:researchUuid,sourceKey:key,rationale:text,employerQuestion:text}).strict().nullable()}).strict();
const schemas={failure:failurePayload,comparison:comparisonPayload,tension:tensionPayload,apprenticeship:apprenticeshipPayload};
const base=z.object({id:researchUuid.optional(),kind:z.enum(RESEARCH_KINDS),title:text,caseIds:z.array(researchUuid).min(1).max(2),experienceIds:z.array(researchUuid).max(20),sources:z.array(source).max(12),payload:z.record(z.string(),z.unknown()),expectedRevision:z.number().int().min(0),requestId:researchUuid}).strict();

export function parseResearchInput(value:unknown):ResearchInput {
 const input=base.parse(value);
 if((!!input.id&&input.expectedRevision<1)||(!input.id&&input.expectedRevision!==0))throw new Error('记录标识与版本不一致');
 for(const values of [input.caseIds,input.experienceIds,input.sources.map(s=>s.key)])if(new Set(values).size!==values.length)throw new Error('记录或来源键不可重复');
 if(input.sources.some(selected=>!selected.publicConfirmed))throw new Error('所有选定引文都需要明确确认可公开核对');
 if((input.kind==='failure'||input.kind==='tension')&&input.sources.some(selected=>selected.kind==='job'))throw new Error('退出披露与需求矛盾只能使用公开材料或冻结快照');
 if(input.kind!=='apprenticeship'&&input.experienceIds.length)throw new Error('只有创业学徒可选择确认经历');
 const payload=schemas[input.kind].parse(input.payload) as Record<string,unknown>;
 const sources=new Map(input.sources.map(s=>[s.key,s]));
 function reference(sourceKey:string,publicOnly=false){const selected=sources.get(sourceKey);if(!selected||!selected.publicConfirmed||(publicOnly&&selected.kind==='job'))throw new Error('请明确选择并确认可公开核对的引文');return selected;}
 switch(input.kind){
  case 'failure':reference(payload.disclosureKey as string,true);break;
  case 'comparison':{
   if(input.caseIds.length!==2)throw new Error('结构对照需要两个不同案例');
   const dimensions=payload.dimensions as z.infer<typeof comparisonPayload>['dimensions'];
   if(new Set(dimensions.map(d=>d.key)).size!==6)throw new Error('请完整填写六个不同维度');
   for(const dimension of dimensions)for(const sourceKey of [dimension.leftSourceKey,dimension.rightSourceKey])if(sourceKey!==null)reference(sourceKey);
   break;
  }
  case 'tension':{
   const left=reference(payload.leftSourceKey as string,true),right=reference(payload.rightSourceKey as string,true);
   if(left.kind===right.kind&&left.id===right.id&&left.quote===right.quote)throw new Error('矛盾两侧不能引用完全相同的片段');break;
  }
  case 'apprenticeship':{
   const job=payload.jobLink as z.infer<typeof apprenticeshipPayload>['jobLink'];
   if(job){const selected=reference(job.sourceKey);if(selected.kind!=='job'||selected.id!==job.jobId)throw new Error('岗位关联须引用该岗位正文');}break;
  }
 }
 return {...input,payload};
}
export function validateResearchInput(value:unknown):asserts value is ResearchInput {parseResearchInput(value);}

export function researchQuestions(kind:ResearchKind,payload:Record<string,unknown>):string[]{
 switch(kind){
  case 'failure':return ['披露说的是永久退出、迁址还是暂时停业？同一主体与范围能核对吗？','退出事实之外，哪些经营原因仍是你的假设？什么反例会推翻它？','下一份材料如何区分经营收缩与渠道迁移？'];
  case 'comparison':return ['两侧买家、使用者与付费者真的相同吗？缺出处的整理要怎样核对？','看到的相似结构是否只是表面相似？资源、期间与交付条件有哪些不同？','哪个反例会推翻这条迁移假设？'];
  case 'tension':return ['两段原话是否来自同一任务和可比场景？会不会只是不同人在说不同事情？','当前替代方案如何处理这组取舍？你的解释会被什么观察推翻？','公开表达不代表总体需求或愿意付费；下一次真实接触核对什么？'];
  case 'apprenticeship':return ['你选择的经历真的证明做过这项工作，还是只是读过或感兴趣？','在已确认的时间、现金与资源约束下，哪项练习能暴露能力缺口？',...(payload.jobLink?['招聘正文明确要求什么？雇主的哪一个回答会否定这条岗位联系？']:['若关联岗位，需要先核对已保存招聘正文中的实际职责。'])];
 }
}
