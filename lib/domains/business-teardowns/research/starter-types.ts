import type {CaseSection} from '../report-domain';
import type {CaseOption,ResearchKind,SourceInput,SourceOption} from './domain';

export type StarterCase = CaseOption & {
  merchantId:string;
  platform:string;
  sources:SourceOption[];
  sourcesTruncated:boolean;
  report:{id:string;revision:number;sections:CaseSection[]}|null;
};
export type ComparisonCandidate = CaseOption & {reason:string};
export type DraftHint = {
  id:string;caseId:string;caseName:string;snapshotId:string;quote:string;
  reportId:string;reportRevision:number;section:string;
};
export type ResearchDraft = {title:string;payload:Record<string,unknown>;bindings:Record<string,string[]>};
export type ResearchStarter = {
  kind:ResearchKind;cases:CaseOption[];sources:SourceOption[];
  candidates:ComparisonCandidate[];hints:DraftHint[];draft:ResearchDraft;
  gaps:string[];truncated:boolean;
};
export type AdoptedResearchDraft = {title:string;payload:Record<string,unknown>;sources:SourceInput[]};
