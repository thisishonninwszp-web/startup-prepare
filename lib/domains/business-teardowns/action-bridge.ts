import {reportCommand} from './report-commands';
import {uuid,requiredText} from './domain';
import type {ExperimentVersionInput} from '@/lib/domains/experiments/domain';
import {validateVersion as validateExperimentVersion} from '@/lib/domains/experiments/domain';
export type ExperimentDraft=ExperimentVersionInput;
export type BridgeInput={caseId:string;reportId:string;requestId:string;kind:'observation'|'experiment';takeaway?:string;experiment?:ExperimentVersionInput};
export type ActionPreview=BridgeInput&{token:string;inputHash:string;localCaseLink:string};
export function previewBusinessAction(owner:string,input:BridgeInput):Promise<ActionPreview>{uuid(owner);uuid(input.caseId);uuid(input.reportId);uuid(input.requestId);if(input.kind==='observation'){requiredText(input.takeaway??'',12000);if(input.experiment)throw new Error('无效观察输入');}else if(input.kind==='experiment'){validateExperimentVersion(input.experiment as ExperimentVersionInput);if(input.takeaway)throw new Error('无效实验输入');}else throw new Error('无效行动类型');return reportCommand(owner,'preview',input);}
export function confirmBusinessAction(owner:string,preview:ActionPreview):Promise<{targetId:string;kind:'observation'|'experiment'}>{uuid(preview.token);return reportCommand(owner,'confirm',preview);}
