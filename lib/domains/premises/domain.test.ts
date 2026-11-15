import {expect,it} from 'vitest';
import {commandSchema, pageSchema, resultSchema} from './domain';
const id='aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
it('accepts independently written premises with literal keywords',()=>{expect(commandSchema.parse({operation:'save',requestId:id,id,expectedRevision:0,text:'店家愿意换供应商',invalidWhen:'续约不再比较',keywords:['供应商','%_']})).toMatchObject({keywords:['供应商','%_']});});
it('rejects source copies, unknown operations and ambiguous revisions',()=>{for(const input of [{operation:'save',requestId:id,id,expectedRevision:0,text:'x',invalidWhen:'x',keywords:['x'],sourceBody:'copy'},{operation:'link',requestId:id,id,expectedRevision:1,targetKind:'method',targetId:id,rationale:''},{operation:'erase',requestId:id,id,expectedRevision:1.5}])expect(()=>commandSchema.parse(input)).toThrow();});
it('does not treat malformed server responses as a successful save or empty page',()=>{expect(()=>resultSchema.parse({id})).toThrow();expect(()=>pageSchema.parse({items:[]})).toThrow();});
