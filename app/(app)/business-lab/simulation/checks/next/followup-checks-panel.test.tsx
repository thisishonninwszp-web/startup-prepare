vi.mock('@/app/(app)/business-lab/action-choices/actions',()=>({loadActionChoiceIdeasAction:vi.fn(async()=>({available:true,items:[],nextCursor:null}))}));
import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('./actions',()=>({followupChecksListAction:vi.fn(),followupCheckGetAction:vi.fn(),followupCheckSourceAction:vi.fn(),followupCheckSaveAction:vi.fn(),followupCheckSourcesAction:vi.fn()}));
import {FollowupChecksPanel} from './followup-checks-panel';
import {record,source,priorResult,plan,body,resultId,caseId} from './test-fixtures';
const base={initialState:{available:true,items:[],nextCursor:null},initialSources:{available:true,items:[priorResult],nextCursor:null},today:'2026-11-19'};
describe('follow-up independent authoring rendering',()=>{
 it('shows live result beside four empty fields without original plan snapshot',()=>{const html=renderToStaticMarkup(<FollowupChecksPanel {...base} initialSource={source}/>);expect(html).toContain('lg:grid-cols-2');expect(html).toContain(body.found);for(const name of ['question','falsifier','method'])expect(html).toMatch(new RegExp(`<textarea name="${name}"[^>]*></textarea>`));expect(html).toMatch(/name="dueDate"[^>]*value=""/);expect(html).not.toContain(priorResult.planSnapshot!.question);expect(html).not.toContain(plan.question);expect(html).toContain(`recordId=${resultId}`);});
 it('source selectors expose metadata only; missing migration is isolated',()=>{const html=renderToStaticMarkup(<FollowupChecksPanel {...base}/>);expect(html).toContain(body.checkedOn);expect(html).not.toContain(body.learned);expect(html).not.toContain(body.found);expect(html).not.toContain(priorResult.planSnapshot!.falsifier);const missing=renderToStaticMarkup(<FollowupChecksPanel {...base} initialState={{available:false,items:[],nextCursor:null}}/>);expect(missing).toContain('141');expect(missing).not.toContain('<textarea');});
 it('saved own plan stays editable after source loss and links current exact plan to result recording',()=>{const html=renderToStaticMarkup(<FollowupChecksPanel {...base} initialRecord={{...record,source:null}}/>);expect(html).toContain(plan.question);expect(html).toContain('删除这份计划');expect(html).not.toContain(body.found);expect(html).toContain(`caseId=${caseId}&amp;planId=${record.id}&amp;planRevision=2`);});
});
