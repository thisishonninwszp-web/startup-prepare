import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('./actions',()=>({loadWithdrawalsAction:vi.fn(),loadWithdrawalAction:vi.fn(),loadWithdrawalIssuersAction:vi.fn(),loadWithdrawalTodayAction:vi.fn(),withdrawalCommandAction:vi.fn()}));
import {WithdrawalPanel} from './withdrawal-panel';
import {withdrawalComparisonHref,pinWithdrawalRequest,hideErasedWithdrawals} from './presentation';
const id='10000000-0000-4000-8000-000000000001';
describe('withdrawal reading and save lifecycle',()=>{
 it('does not turn unavailable source into a closed company or invented lesson',()=>{const html=renderToStaticMarkup(<WithdrawalPanel initialLessons={{available:true,items:[],nextCursor:null}} initialIssuers={{available:true,items:[],nextCursor:null}} initialToday={null}/>);expect(html).toContain('今天还没有新教材');expect(html).toContain('网址打不开不代表已经退出');expect(html).toContain('预览教材');expect(html).toContain('准确域名');expect(html).not.toContain('示例公司');});
 it('requires both hypotheses and a selected real case for comparison entry',()=>{expect(withdrawalComparisonHref({id,caseId:null,revision:1,explanationA:'A',explanationB:'B'})).toBeNull();expect(withdrawalComparisonHref({id,caseId:id,revision:2,explanationA:'A',explanationB:null})).toBeNull();expect(withdrawalComparisonHref({id,caseId:id,revision:2,explanationA:'A',explanationB:'B'})).toBe(`/business-lab/explanations?kind=withdrawal&lessonId=${id}&lessonRevision=2&caseId=${id}`);});
 it('pins the exact body and request after an unacknowledged response',()=>{const body={operation:'erase',id,requestId:id,expectedRevision:1} as const;const pinned=pinWithdrawalRequest(null,body);expect(pinWithdrawalRequest(pinned,{...body,expectedRevision:2})).toBe(pinned);});
 it('never restores erased source text from older list or mutation reads',()=>{expect(hideErasedWithdrawals([{id,source:{text:'old'}}],new Set([id]))).toEqual([]);});
});
