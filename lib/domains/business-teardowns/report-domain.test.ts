import {describe,it,expect} from 'vitest';
import {SECTION_KEYS,validateDraftInput} from './report-domain';
describe('report contract',()=>{it('requires twelve sections and explicit nonempty selected sources',()=>{expect(SECTION_KEYS).toHaveLength(12);expect(()=>validateDraftInput({} as never)).toThrow();});});
