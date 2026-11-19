import type {FollowupCheckRecord,FollowupCheckSource} from '@/lib/domains/business-teardowns/followup-checks/domain';
import type {RealityCheckPlan} from '@/lib/domains/business-teardowns/reality-checks/domain';
import {record as priorResult,body,caseId,recordId as resultId} from '../results/test-fixtures';

export {body,caseId,resultId,priorResult};
export const recordId='40000000-0000-4000-8000-000000000001';
export const plan:RealityCheckPlan={question:'下一次要确认的问题',falsifier:'另一家也没有才推翻',method:'亲手再访谈一位经营者',dueDate:'2026-11-22'};
export const source:FollowupCheckSource={id:resultId,caseId,body,createdAt:priorResult.createdAt};
export const record:FollowupCheckRecord={id:recordId,caseId,resultId,plan,revision:2,createdAt:'2026-11-19T04:00:00Z',updatedAt:'2026-11-19T05:00:00Z',source};
