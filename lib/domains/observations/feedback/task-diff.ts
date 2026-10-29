import type {TaskConfig} from '../domain';
function stable(value:unknown):string {
 if(Array.isArray(value))return `[${value.map(stable).join(',')}]`;
 if(value&&typeof value==='object')return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
 return JSON.stringify(value)??'null';
}
export type ConfigChange={field:keyof TaskConfig;before:unknown;after:unknown;added?:string[];removed?:string[]};
export function taskConfigDiff(before:TaskConfig,after:TaskConfig){
 const changes:ConfigChange[]=[];
 for(const field of Object.keys(before) as (keyof TaskConfig)[]){
  if(stable(before[field])===stable(after[field]))continue;
  const change:ConfigChange={field,before:before[field],after:after[field]};
  if(['sources','fixedPhrases','exploratoryPhrases'].includes(field)){
   const a=before[field] as string[],b=after[field] as string[];
   change.added=b.filter(v=>!a.includes(v));change.removed=a.filter(v=>!b.includes(v));
  }
  changes.push(change);
 }
 return {changes,contextChanged:changes.some(c=>['region','language','timeRange','filters','sources'].includes(c.field))};
}
