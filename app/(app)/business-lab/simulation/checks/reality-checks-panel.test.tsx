import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('./actions',()=>({realityChecksListAction:vi.fn(),realityCheckGetAction:vi.fn(),realityCheckSourcesAction:vi.fn(),realityCheckSourceAction:vi.fn(),realityCheckSaveAction:vi.fn()}));
import {RealityChecksPanel} from './reality-checks-panel';
import {source,record,caseId,sourceId} from './test-fixtures';
describe('reality plan rendering',()=>{
 it('does not prefill a question from hypothetical source notes',()=>{const html=renderToStaticMarkup(<RealityChecksPanel initialState={{available:true,items:[],nextCursor:null}} initialSources={{items:[{...source,roundCount:2}],nextCursor:'more'}} initialSource={source} today="2026-11-19"/>);expect(html).toContain('假设');expect(html).toContain('自己的假设理由');expect(html).toContain('更多来源');expect(html).toMatch(/<textarea name="question"[^>]*><\/textarea>/);expect(html).toContain('先预览确认计划');expect(html).not.toContain('确认保存这份计划');});
 it('hides source prose after source loss while retaining editable plan and delete',()=>{const html=renderToStaticMarkup(<RealityChecksPanel initialState={{available:true,items:[record],nextCursor:'next'}} initialSources={{items:[],nextCursor:null}} initialRecord={{...record,source:{...record.source,available:false,reason:null,checkNext:null,title:null,currentRevision:null,caseAvailable:false,caseTitle:null}}} initialSource={null} today="2026-11-19"/>);for(const text of ['亲手写的问题','删除这份计划','更多计划','已过截止日期','来源目前不可读取'])expect(html).toContain(text);expect(html).not.toContain('自己的假设理由');expect(html).toContain(`/business-lab/simulation?caseId=${caseId}&amp;recordId=${sourceId}`);});
 it('gives missing137 an isolated unavailable state',()=>{const html=renderToStaticMarkup(<RealityChecksPanel initialState={{available:false,items:[],nextCursor:null}} initialSources={{items:[],nextCursor:null}} today="2026-11-19"/>);expect(html).toContain('137');expect(html).not.toContain('先预览确认计划');});
});
