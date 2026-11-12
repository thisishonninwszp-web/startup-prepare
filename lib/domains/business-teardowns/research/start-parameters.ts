import {RESEARCH_KINDS,researchUuid,type ResearchKind} from './domain';

export function researchStartOptions(input:{caseId?:unknown;kind?:unknown}):{caseId:string|undefined;kind:ResearchKind}{
  const parsed=researchUuid.safeParse(input.caseId);
  const caseId=parsed.success?parsed.data:undefined;
  const kind=typeof input.kind==='string'&&RESEARCH_KINDS.includes(input.kind as ResearchKind)?input.kind as ResearchKind:caseId?'comparison':'failure';
  return {caseId,kind};
}

export function researchStartHref(caseId?:string,kind?:ResearchKind):string {
  const params=new URLSearchParams();
  if(caseId)params.set('caseId',caseId);
  if(kind)params.set('kind',kind);
  return `/business-lab/research${params.size?`?${params}`:''}`;
}
