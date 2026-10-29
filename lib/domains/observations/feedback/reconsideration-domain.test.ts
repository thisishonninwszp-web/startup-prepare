import {describe,it,expect} from 'vitest';
import {normalizeCondition,normalizeEvaluation,parseReconsiderationCursor} from './reconsideration-domain';
describe('archived condition boundary',()=>{
 it('requires explicit learning, criterion and scope',()=>{expect(()=>normalizeCondition({learned:'x',changeRequired:'x',criterion:'',scope:'x'})).toThrow();});
 it('retains a manual quote with its material instead of verification claims',()=>{const result=normalizeEvaluation({outcome:'met',coverage:'one public record',source:{kind:'manual',url:'https://example.com',rawText:'actual statement',quote:'actual'}});expect(result.source.kind).toBe('manual');expect(()=>normalizeEvaluation({...result,source:{...result.source,quote:'invented'}})).toThrow();});
 it('requires one exact observation record index',()=>{expect(()=>normalizeEvaluation({outcome:'met',coverage:'one',source:{kind:'observation_run',runId:'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',recordIndex:-1,quote:'actual'}})).toThrow();});
 it('keeps sequence pagination precise',()=>{expect(parseReconsiderationCursor('9007199254740993')).toBe('9007199254740993');expect(()=>parseReconsiderationCursor('1.1')).toThrow();});
});
