import {describe,it,expect} from 'vitest';
import {realityCheckPlanSchema,realityCheckCommandSchema} from './domain';
const id='20000000-0000-4000-8000-000000000001';
const plan={question:'要核实什么',falsifier:'什么会推翻它',method:'问当事人',dueDate:'2026-11-30'};
const command={operation:'save',id,requestId:id,expectedRevision:0,simulationId:id,round:1,plan,confirmed:true};
describe('personally confirmed reality check',()=>{
 it('requires all independent fields and explicit confirmation',()=>{expect(realityCheckCommandSchema.parse(command)).toEqual(command);for(const patch of [{confirmed:false},{confirmed:undefined},{sourceRevision:2},{userId:id},{round:0},{round:7},{expectedRevision:2147483647}])expect(realityCheckCommandSchema.safeParse({...command,...patch}).success).toBe(false);for(const field of Object.keys(plan))expect(realityCheckPlanSchema.safeParse({...plan,[field]:undefined}).success).toBe(false);});
 it('trims text with UTF16 limits and rejects impossible dates',()=>{expect(realityCheckPlanSchema.parse({...plan,question:'  问题\u3000'}).question).toBe('问题');for(const patch of [{question:'\t\u3000'},{question:'😀'.repeat(501)},{falsifier:'😀'.repeat(1501)},{method:'x'.repeat(3001)},{dueDate:'2026-02-29'},{dueDate:'1900-02-29'},{dueDate:'2201-01-01'},{dueDate:'1899-12-31'},{dueDate:'2026-1-01'},{has_pain:'yes'}])expect(realityCheckPlanSchema.safeParse({...plan,...patch}).success).toBe(false);expect(realityCheckPlanSchema.safeParse({...plan,dueDate:'2000-02-29',question:'😀'.repeat(500)}).success).toBe(true);});
 it('requires a positive revision to erase and excludes plan/source edits',()=>{expect(realityCheckCommandSchema.safeParse({operation:'erase',id,requestId:id,expectedRevision:1}).success).toBe(true);for(const patch of [{expectedRevision:0},{plan},{simulationId:id},{confirmed:true}])expect(realityCheckCommandSchema.safeParse({operation:'erase',id,requestId:id,expectedRevision:1,...patch}).success).toBe(false);});
});
