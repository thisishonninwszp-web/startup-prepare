import {it,expect} from 'vitest';
import {workspaceHref,workspaceKind} from '../workspace/domain';
it('reopens explanation plans through their own editor rather than simulation',()=>{expect(workspaceKind.parse('explanation_check')).toBe('explanation_check');expect(workspaceHref({kind:'explanation_check' as never,id:'10000000-0000-4000-8000-000000000001',caseId:'20000000-0000-4000-8000-000000000001'})).toBe('/business-lab/explanations?caseId=20000000-0000-4000-8000-000000000001&recordId=10000000-0000-4000-8000-000000000001');});
