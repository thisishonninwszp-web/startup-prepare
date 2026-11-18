import {describe,it,expect} from 'vitest';
import {workspaceHref,workspaceCursorSchema,workspaceStart,workspaceItemSchema} from './domain';
const id='10000000-0000-4000-8000-000000000001',caseId='10000000-0000-4000-8000-000000000002';
describe('case continuation identity',()=>{
 it('opens immutable identities through fixed tool paths',()=>{expect(workspaceHref({kind:'cash',id,caseId})).toBe(`/business-lab/cash?caseId=${caseId}&recordId=${id}`);expect(workspaceHref({kind:'lesson',id,caseId})).toBe(`/business-lab/counterexamples?caseId=${caseId}&methodId=${id}&methodKind=lesson`);expect(()=>workspaceHref({kind:'evil',id,caseId} as never)).toThrow();});
 it('rejects unknown cursor keys, invalid identifiers and array query values',()=>{expect(workspaceCursorSchema.safeParse({date:'2026-11-17T00:00:00Z',kind:'cash',id,owner:id}).success).toBe(false);expect(()=>workspaceStart({recordId:[id]})).toThrow();expect(()=>workspaceStart({recordId:'bad'})).toThrow();expect(workspaceStart({recordId:id,caseId})).toEqual({recordId:id,caseId});});
});

it('accepts complete validated workspace DTOs when creating fixed links',()=>{const item={kind:'cash' as const,id,caseId,caseTitle:'店',revision:1,updatedAt:'2026-11-17T00:00:00Z',title:'本人假设',excerpt:'本人理由',nextCheck:null,sourceAvailable:true};expect(workspaceHref(item)).toBe(`/business-lab/cash?caseId=${caseId}&recordId=${id}`);});

it('accepts SQL codepoint-bounded emoji summaries and rejects actual overflow',()=>{const item={kind:'cash',id,caseId,caseTitle:'😀'.repeat(300),revision:1,updatedAt:'2026-11-17T00:00:00Z',title:'😀'.repeat(160),excerpt:'😀'.repeat(400),nextCheck:'😀'.repeat(400),sourceAvailable:true};expect(workspaceItemSchema.safeParse(item).success).toBe(true);expect(workspaceItemSchema.safeParse({...item,excerpt:item.excerpt+'😀'}).success).toBe(false);});
