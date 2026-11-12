import {expect,it} from 'vitest';
import {researchStartOptions,researchStartHref} from './start-parameters';
const caseId='10000000-0000-4000-8000-000000000001';
it('starts from a selected daily case in comparison rather than assuming a closure',()=>{
 expect(researchStartOptions({caseId})).toEqual({caseId,kind:'comparison'});
 expect(researchStartOptions({})).toEqual({caseId:undefined,kind:'failure'});
 for(const kind of ['failure','comparison','tension','apprenticeship'])expect(researchStartOptions({caseId,kind}).kind).toBe(kind);
});
it('ignores malformed and repeated URL parameters without leaking them into lookups',()=>{
 expect(researchStartOptions({caseId:'-'.repeat(36),kind:'invalid'})).toEqual({caseId:undefined,kind:'failure'});
 expect(researchStartOptions({caseId:[caseId],kind:['comparison']})).toEqual({caseId:undefined,kind:'failure'});
});
it('carries the chosen case and workflow in the research entry URL',()=>{
 expect(researchStartHref(caseId,'apprenticeship')).toBe(`/business-lab/research?caseId=${caseId}&kind=apprenticeship`);
 expect(researchStartHref()).toBe('/business-lab/research');
});
