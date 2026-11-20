import type {ConfirmationNode} from '@/lib/domains/business-teardowns/history/domain';
export const owner='10000000-0000-4000-8000-000000000001',planId='20000000-0000-4000-8000-000000000001',resultId='30000000-0000-4000-8000-000000000001',caseId='40000000-0000-4000-8000-000000000001',simulationId='50000000-0000-4000-8000-000000000001';
export const at='2026-11-19T00:00:00.123456+00:00';
export const plan={question:'当时亲手写的问题',falsifier:'当时亲手写的推翻条件',method:'当时亲手写的确认做法',dueDate:'2026-11-30'};
export const body={checkedOn:'2000-02-29',examined:'实际查过的人和记录',found:'独立调查发现',sourceNote:'本人提供的出处',sourceUrl:'https://example.com/source',learned:'这是本人写下的改变理由'};
export const planNode:ConfirmationNode={kind:'plan',id:planId,caseId,revision:2,at,parent:{kind:'simulation',id:simulationId,revision:2,available:true},plan,body:null,planSnapshot:null,planSavedAt:null,snapshotErasedAt:null};
export const resultNode:ConfirmationNode={kind:'result',id:resultId,caseId,revision:1,at,parent:{kind:'plan',id:planId,revision:2,available:true},plan:null,body,planSnapshot:plan,planSavedAt:at,snapshotErasedAt:null};
