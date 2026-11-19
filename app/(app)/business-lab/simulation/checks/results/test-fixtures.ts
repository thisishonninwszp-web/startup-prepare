import type {RealityResultBody,RealityResultPlan,RealityResultRecord,RealityResultVersion} from '@/lib/domains/business-teardowns/reality-results/domain';
export const caseId='10000000-0000-4000-8000-000000000001',planId='20000000-0000-4000-8000-000000000001',recordId='30000000-0000-4000-8000-000000000001';
export const source:RealityResultVersion={planId,caseId,revision:2,plan:{question:'原来要确认的问题',falsifier:'原来的推翻条件',method:'原来的确认做法',dueDate:'2026-11-18'},savedAt:'2026-11-18T16:00:00Z',currentRevision:25,caseAvailable:false,caseTitle:null};
export const plan:RealityResultPlan={id:planId,caseId,question:'现在的问题',revision:25,createdAt:'2026-11-17T00:00:00Z',updatedAt:'2026-11-19T00:00:00Z',caseAvailable:false,caseTitle:null};
export const body:RealityResultBody={checkedOn:'2026-11-18',examined:'亲手查了三家门店',found:'其中两家没有这项服务',sourceNote:'门店现场观察，自己记录',sourceUrl:'https://example.com/notes',learned:'需要先核对服务是否普遍存在'};
export const record:RealityResultRecord={id:recordId,caseId,planId,planRevision:2,planSavedAt:source.savedAt,planSnapshot:source.plan,snapshotErasedAt:null,body,createdAt:'2026-11-19T03:00:00Z',revision:1,planCurrentRevision:25};
