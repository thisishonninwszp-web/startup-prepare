import type {CaseSection} from '../report-domain';
import type {ResearchKind} from './domain';
import {DIMENSIONS,RESEARCH_LABELS} from './presentation';
import type {AdoptedResearchDraft,DraftHint,ResearchStarter,StarterCase} from './starter-types';

const dimensionSections = {buyer:'buyers',trigger:'trigger',delivery:'operations',alternative:'comparison'} as const;
const sectionLabels:Record<string,string>={buyers:'购买者',trigger:'触发场景',operations:'经营与交付',comparison:'替代与对照'};

export function researchSectionLabel(section:string):string {
  return sectionLabels[section]??'相关解释';
}

export function researchDraftMatchesCases(draftCaseIds:string[],currentCaseIds:string[],selectionChanged=false):boolean {
  return !selectionChanged&&draftCaseIds.length===currentCaseIds.length&&draftCaseIds.every((id,index)=>id===currentCaseIds[index]);
}

export function buildResearchStarter(kind:ResearchKind,selected:StarterCase[],recent:StarterCase[]):ResearchStarter {
  const hints:DraftHint[]=[];
  const bindings:Record<string,string[]>={};
  const gaps:string[]=[];
  const payload:Record<string,unknown>={};

  function explanation(item:StarterCase,section:CaseSection['key'],field:string):string {
    if(!item.report)return '';
    const interpretations=item.report.sections.find(s=>s.key===section)?.interpretations??[];
    for(const interpretation of interpretations){
      if(typeof interpretation.text!=='string'||!interpretation.text.trim()||interpretation.text.length>2800||!Array.isArray(interpretation.refs)||!interpretation.refs.length)continue;
      const refs=interpretation.refs;
      const valid=refs.every(ref=>typeof ref.quote==='string'&&ref.quote.trim().length>=4&&ref.quote.length<=1600&&item.sources.some(s=>s.kind==='snapshot'&&s.id===ref.snapshotId&&s.text.includes(ref.quote)));
      if(!valid||hints.length+refs.length>12)continue;
      const ids=refs.map((ref,index)=>{
        const id=`${item.id}:${section}:${hints.length+index}`;
        return {id,caseId:item.id,caseName:item.name,snapshotId:ref.snapshotId,quote:ref.quote,reportId:item.report!.id,reportRevision:item.report!.revision,section};
      });
      hints.push(...ids);bindings[field]=ids.map(h=>h.id);
      return `报告解释（待核对）：${interpretation.text.trim()}`;
    }
    gaps.push(`${item.name}：${researchSectionLabel(section)}没有可逐字核对的已发布解释，此项留空。`);
    return '';
  }

  for(const item of selected){
    if(!item.report)gaps.push(`${item.name}：暂无仍可读取的已发布报告，可先从冻结材料自行整理。`);
    if(item.sourcesTruncated)gaps.push(`${item.name}：这里仅带入前 20 份冻结材料；其余请使用来源检索。`);
    if(!item.sources.length)gaps.push(`${item.name}：暂无可逐字核对的冻结正文，公开 API 字段可能没有正文。`);
  }
  if(kind==='comparison'){
    payload.dimensions=DIMENSIONS.map(([key])=>{
      const section=dimensionSections[key as keyof typeof dimensionSections];
      return {key,left:section&&selected[0]?explanation(selected[0],section,`${key}.leftSourceKey`):'',right:section&&selected[1]?explanation(selected[1],section,`${key}.rightSourceKey`):'',leftSourceKey:null,rightSourceKey:null};
    });
    payload.hypothesis='';payload.counterexample='';payload.checkNext='';
    gaps.push('使用者、付款者与跨案例假设需要另行核对；相似解释不能证明因果。');
    if(selected.length<2)gaps.push('再选择一个不同案例，才能保存经营结构对照。');
  }else if(kind==='apprenticeship'){
    payload.mechanism=selected[0]?explanation(selected[0],'operations','mechanism'):'';
    payload.timeBudget='';payload.cashBudget='';payload.constraintsConfirmed=false;
    payload.gap='';payload.practice='';payload.checkNext='';payload.jobLink=null;
    gaps.push('本人经历、时间和费用需要亲自确认；岗位联系仍须核对招聘正文。');
  }else{
    gaps.push(kind==='failure'?'普通经营报告不能证明退出或收缩。请从明确披露变化的公开原文开始。':'经营报告不能代替两侧顾客原话。请各选一段同一任务下的不同原文。');
  }

  const merchantIds=new Set(selected.map(c=>c.merchantId));
  const seenMerchants=new Set<string>();
  const candidates=recent.filter(c=>{
    if(merchantIds.has(c.merchantId)||seenMerchants.has(c.merchantId))return false;
    seenMerchants.add(c.merchantId);return true;
  }).slice(0,6).map(c=>({id:c.id,name:c.name,date:c.date,reason:`${selected[0]?.platform===c.platform?'同一平台的不同商家':'不同平台的商家'}；不代表经营结构相同，需核对购买场景与交付条件。`}));
  const sources=[...new Map(selected.flatMap(c=>c.sources).map(s=>[`${s.kind}:${s.id}`,s])).values()];
  return {kind,cases:selected.map(({id,name,date})=>({id,name,date})),sources,candidates,hints,draft:{title:`${RESEARCH_LABELS[kind]} · ${selected.map(c=>c.name).join(' ↔ ')}`.slice(0,3000),payload,bindings},gaps,truncated:selected.some(c=>c.sourcesTruncated)};
}

export function adoptResearchDraft(starter:ResearchStarter,confirmedIds:string[]):AdoptedResearchDraft {
  const confirmed=new Set(confirmedIds);
  if(confirmed.size!==confirmedIds.length||confirmedIds.some(id=>!starter.hints.some(h=>h.id===id)))throw new Error('请选择当前下稿中的逐字出处');
  const keys=new Map<string,string>();
  const sources=starter.hints.flatMap((hint,index)=>{
    if(!confirmed.has(hint.id))return [];
    const key=`r${index+1}`;keys.set(hint.id,key);
    return [{key,kind:'snapshot' as const,id:hint.snapshotId,quote:hint.quote,publicConfirmed:true}];
  });
  const payload=structuredClone(starter.draft.payload);
  if(starter.kind==='comparison'){
    for(const row of payload.dimensions as Record<string,unknown>[]){
      for(const side of ['left','right']){
        const field=`${row.key}.${side}SourceKey`,ids=starter.draft.bindings[field]??[];
        row[`${side}SourceKey`]=ids.length&&ids.every(id=>keys.has(id))?keys.get(ids[0])!:null;
      }
    }
  }
  return {title:starter.draft.title,payload,sources};
}
