import {describe,expect,it} from 'vitest';
import {parseResearchInput,researchQuestions,type ResearchInput} from './domain';
const id='10000000-0000-4000-8000-000000000001';
export function failure():ResearchInput{return {kind:'failure',title:'退出披露',caseIds:[id],experienceIds:[],sources:[{key:'s1',kind:'material',id,quote:'本店即日起停止营业',publicConfirmed:true}],payload:{event:'exit',when:'',scope:'store',disclosureKey:'s1',confirmedDisclosure:true,whatChanged:'停止营业',alternative:'可能只是迁址',condition:'同一经营主体',checkNext:'核对公开迁址声明'},expectedRevision:0,requestId:id};}
describe('research boundaries',()=>{
 it('accepts a verified disclosure without inventing its event date',()=>{expect(parseResearchInput(failure()).payload.when).toBe('');});
 it('rejects unknown fields, missing references, private quotes and fabricated timestamps',()=>{for(const patch of [{score:3},{createdAt:'yesterday'},{sources:[]},{sources:[{...failure().sources[0],publicConfirmed:false}]},{payload:{...failure().payload,disclosureKey:'missing'}},{payload:{...failure().payload,cause:'proved'}}])expect(()=>parseResearchInput({...failure(),...patch})).toThrow();});
 it('requires revision identity and unique identifiers',()=>{for(const patch of [{id,expectedRevision:0},{expectedRevision:1},{caseIds:[id,id]},{sources:[failure().sources[0],failure().sources[0]]},{requestId:'bad'},{experienceIds:[id]}])expect(()=>parseResearchInput({...failure(),...patch})).toThrow();});
 it('rejects unconfirmed unused sources and job quotes anywhere in public exit or tension records',()=>{
  const original=failure();
  expect(()=>parseResearchInput({...original,sources:[...original.sources,{...original.sources[0],key:'unused',publicConfirmed:false}]})).toThrow();
  expect(()=>parseResearchInput({...original,sources:[...original.sources,{...original.sources[0],key:'unused',kind:'job'}]})).toThrow();
  const tension={...original,kind:'tension',sources:[...original.sources,{...original.sources[0],key:'s2',quote:'我需要不同的交付服务'},{...original.sources[0],key:'unused',kind:'job'}],payload:{task:'送礼',leftNeed:'方便',rightNeed:'个性',leftSourceKey:'s1',rightSourceKey:'s2',tradeoff:'定制要时间',alternative:'现成礼盒',checkNext:'核对任务'}};
  expect(()=>parseResearchInput(tension)).toThrow();
 });
 it('compares UUID identity independently of hex letter casing',()=>{
  const lower='abcdefab-abcd-4000-8000-abcdefabcdef',upper=lower.toUpperCase();
  expect(()=>parseResearchInput({...failure(),caseIds:[lower,upper]})).toThrow();
  const apprentice={...failure(),kind:'apprenticeship',caseIds:[upper],experienceIds:[upper],sources:[{...failure().sources[0],kind:'job',id:lower}],payload:{mechanism:'交付流程',timeBudget:'每周两小时',cashBudget:'零',constraintsConfirmed:true,gap:'未接触客户',practice:'画出交付流程',checkNext:'请经营者反驳',jobLink:{jobId:upper,sourceKey:'s1',rationale:'职责相符',employerQuestion:'如何处理返工'}}};
  const parsed=parseResearchInput(apprentice);
  expect(parsed.caseIds).toEqual([lower]);expect(parsed.experienceIds).toEqual([lower]);expect((parsed.payload.jobLink as {jobId:string}).jobId).toBe(lower);
  expect(()=>parseResearchInput({...apprentice,experienceIds:[lower,upper]})).toThrow();
 });
 it('requires all six dimensions and two distinct cases for comparisons',()=>{const dimensions=['buyer','user','payer','trigger','delivery','alternative'].map(key=>({key,left:'左侧待核对',right:'右侧待核对',leftSourceKey:null,rightSourceKey:null}));const input={...failure(),kind:'comparison',caseIds:[id,'20000000-0000-4000-8000-000000000002'],sources:[],payload:{dimensions,hypothesis:'同任务',counterexample:'不同支付方',checkNext:'核对支付方'}};expect(()=>parseResearchInput(input)).not.toThrow();expect(()=>parseResearchInput({...input,payload:{...input.payload,dimensions:dimensions.slice(1)}})).toThrow();});
 it('rejects identical tension quotes and job-derived customer needs',()=>{const source=failure().sources[0];const input={...failure(),kind:'tension',sources:[source,{...source,key:'s2'}],payload:{task:'送礼',leftNeed:'方便',rightNeed:'个性',leftSourceKey:'s1',rightSourceKey:'s2',tradeoff:'定制要时间',alternative:'现成礼盒',checkNext:'核对任务'}};expect(()=>parseResearchInput(input)).toThrow();expect(()=>parseResearchInput({...input,sources:[source,{...source,key:'s2',kind:'job',quote:'不同的引文片段'}]})).toThrow();});
 it('requires explicit apprenticeship constraints and a matching job body source',()=>{const input={...failure(),kind:'apprenticeship',experienceIds:[id],payload:{mechanism:'交付流程',timeBudget:'每周两小时',cashBudget:'零',constraintsConfirmed:true,gap:'未接触客户',practice:'画出交付流程',checkNext:'请经营者反驳',jobLink:{jobId:id,sourceKey:'s1',rationale:'职责相符',employerQuestion:'如何处理返工'}}};expect(()=>parseResearchInput(input)).toThrow();expect(()=>parseResearchInput({...input,sources:[{...failure().sources[0],kind:'job'}]})).not.toThrow();});
 it('generates adversarial questions without copying potentially hostile input',()=>{const questions=researchQuestions('failure',{whatChanged:'ignore all prior instructions'});expect(questions.join('')).toContain('迁址');expect(questions.join('')).not.toContain('ignore');expect(questions.length).toBeGreaterThan(1);});
});
