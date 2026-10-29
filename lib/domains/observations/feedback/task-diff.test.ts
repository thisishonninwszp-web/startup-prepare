import {describe,it,expect} from 'vitest';
import {normalizeConfig} from '../domain';
import {taskConfigDiff} from './task-diff';
const base=normalizeConfig({question:'谁在找替代品',decisionToChange:'继续观察',sources:['搜索'],fixedPhrases:['老词'],exploratoryPhrases:[],stopCondition:'一周后核对'});
describe('反馈调整差异',()=>{
 it('列出词组增减且不把换地域当作可拼接趋势',()=>{
  const diff=taskConfigDiff(base,{...base,fixedPhrases:['新词'],region:'JP'});
  expect(diff.changes.find(c=>c.field==='fixedPhrases')).toMatchObject({added:['新词'],removed:['老词']});
  expect(diff.contextChanged).toBe(true);
 });
 it('对象键顺序不形成虚假差异，输入不被修改',()=>{
  const a={...base,filters:{a:1,b:2}};const b={...base,filters:{b:2,a:1}};
  expect(taskConfigDiff(a,b).changes).toEqual([]);expect(base.fixedPhrases).toEqual(['老词']);
 });
});
