import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('./actions',()=>({}));
import {BusinessCounterexamplesPanel} from './counterexamples-panel';
describe('反例研究页面',()=>{
 it('identifies a result-origin method without inventing a report source',()=>{const method={id:'10000000-0000-4000-8000-000000000001',kind:'learning' as const,caseId:'10000000-0000-4000-8000-000000000002',reportId:null,baselineHash:'a'.repeat(32),draft:{method:'本人独立方法',scenario:'适用任务',conditions:'需要条件',failureConditions:'不能照搬',unknowns:'仍未知'}};const html=renderToStaticMarkup(<BusinessCounterexamplesPanel initialState={{available:true,items:[],nextCursor:null}} initialMethods={{items:[method],nextCursor:null}} initialCases={{items:[],nextCursor:null}} initialMethod={method}/>);expect(html).toContain('来自本人调查的方法');expect(html).toContain(`/business-lab/methods?recordId=${method.id}`);});
 it('局部缺少129时明确说明，不冒充空记录',()=>{const html=renderToStaticMarkup(<BusinessCounterexamplesPanel initialState={{available:false,items:[],nextCursor:null}} initialMethods={{items:[],nextCursor:null}} initialCases={{items:[],nextCursor:null}}/>);expect(html).toContain('129');expect(html).toContain('反例研究');});
 it('本人必须填写判断和完整改写；提示只是问题且删除保留已确认方法',()=>{const html=renderToStaticMarkup(<BusinessCounterexamplesPanel initialState={{available:true,items:[],nextCursor:null}} initialMethods={{items:[],nextCursor:null}} initialCases={{items:[],nextCursor:null}}/>);for(const label of ['为什么可能冲突','哪些条件其实不同','下一步补什么核对','成立条件','失效条件','仍不知道什么','保存研究不会自动追加方法','删除研究不会删除'])expect(html).toContain(label);expect(html).not.toContain('score');});
});
