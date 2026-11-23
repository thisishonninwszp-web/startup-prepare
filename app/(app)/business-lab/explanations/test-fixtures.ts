import type {ExplanationPlanDraft,ExplanationSource,ExplanationPlanRecord} from '@/lib/domains/business-teardowns/explanations/domain';
export const caseId='10000000-0000-4000-8000-000000000001',recordId='20000000-0000-4000-8000-000000000001',reportId='30000000-0000-4000-8000-000000000001';
export const draft:ExplanationPlanDraft={question:'なぜ選ばれたか',expectedA:'配送が同じでも選ぶ',expectedB:'配送が同じなら安い方を選ぶ',uncontrolled:'露出の差は未統制',falsifier:'安さ以外に違いが見つからない',method:'同条件の公開資料を比べる',dueDate:'2026-12-01'};
export const source:ExplanationSource={caseId,title:'本人が選んだ事例',explanationA:'假设：手間を減らした',explanationB:'假设：単に安かった',distinguishingObservation:'同価格でも選ばれるか',refs:[],anchor:{kind:'report',reportId,reportRevision:1,section:'value',index:0,manifestHash:'manifest'}};
export const record:ExplanationPlanRecord={id:recordId,caseId,anchor:source.anchor,draft,revision:1,createdAt:'2026-11-20T00:00:00Z',updatedAt:'2026-11-20T00:00:00Z',source};
