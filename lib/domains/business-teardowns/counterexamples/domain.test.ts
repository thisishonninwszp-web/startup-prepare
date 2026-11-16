import {describe,it,expect} from 'vitest';
import {parseCounterexampleCommand,assertCounterexampleReceiptRevision} from './domain';
const uuid='20000000-0000-4000-8000-000000000001';
const draft={method:'本人改写的方法',scenario:'相同任务',conditions:'资源足够',failureConditions:'没有付款者',unknowns:'尚未核对'};
const save={operation:'save',id:uuid,requestId:uuid,expectedRevision:0,study:{methodId:uuid,methodKind:'learning',baselineHash:'a'.repeat(32),candidateCaseId:uuid,explanation:'可能冲突',conditionDifferences:'买家不同',checkNext:'核对谁付钱',revisedMethodDraft:draft}};
describe('本人反例研究边界',()=>{
 it('保留本人比较及全部改写条件，不把保存当作采用',()=>{expect(parseCounterexampleCommand(save)).toEqual(save);});
 it('拒绝评分、原方法副本、缺失字段和超长文字',()=>{for(const study of [{...save.study,score:9},{...save.study,originalMethod:'copy'},{...save.study,checkNext:''},{...save.study,explanation:'a'.repeat(6001)}])expect(()=>parseCounterexampleCommand({...save,study})).toThrow();});
 it('采用要求本人明确确认且再次带完整预览',()=>{expect(()=>parseCounterexampleCommand({operation:'adopt',id:uuid,requestId:uuid,expectedRevision:1,confirmed:false,preview:draft})).toThrow();expect(parseCounterexampleCommand({operation:'adopt',id:uuid,requestId:uuid,expectedRevision:1,confirmed:true,preview:draft}).operation).toBe('adopt');});
 it('保存后回读到其他页面的新版本时不能静默升级当前填写的版本',()=>{expect(()=>assertCounterexampleReceiptRevision(2,3)).toThrow('另一页面');expect(()=>assertCounterexampleReceiptRevision(2,2)).not.toThrow();});
 it('限制五项中文总量，让每份可保存草稿都能交给既有方法追加入口',()=>{const long=Object.fromEntries(Object.keys(draft).map(key=>[key,'汉'.repeat(6000)]));expect(()=>parseCounterexampleCommand({...save,study:{...save.study,revisedMethodDraft:long}})).toThrow('合计过长');});
});
