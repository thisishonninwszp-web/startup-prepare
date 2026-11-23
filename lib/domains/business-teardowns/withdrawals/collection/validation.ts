import {z} from 'zod';
import {cashDate} from '../../cash/domain';
import {withdrawalLessonInputSchema,withdrawalScope,type WithdrawalIssuer,type WithdrawalLessonInput} from '../domain';
import type {CollectionIssue} from './domain';
export type FrozenCollectionPage={issuer:WithdrawalIssuer;url:string;text:string;capturedAt:string};
const quote=z.string().min(1).max(3000),nullableQuote=quote.nullable();
const factSchema=z.object({pageIndex:z.number().int().min(0).max(2),event:z.enum(['exit','shrink','stop']),phase:z.enum(['announced','completed']),announcedOn:cashDate.nullable(),effectiveOn:cashDate.nullable(),publishedOn:cashDate.nullable(),eventQuote:quote,reasonQuote:nullableQuote,bindings:z.object({subject:quote,phase:quote,announcedOn:nullableQuote,effectiveOn:nullableQuote,publishedOn:nullableQuote}).strict()}).strict();
const analysisFields=['explanationA','explanationB','distinguishingObservation','unknowns'] as const;
const badAnalysis=/[\d０-９]|评分|得分|星级|百分之|很有潜力|不错的想法|值得投资|一定成功|证明了因果/u;
function analysis(value:unknown,hypothesis=false):string|null{if(typeof value!=='string')return null;const text=value.trim();return text&&text.length<=3000&&!badAnalysis.test(text)&&(!hypothesis||text.startsWith('假设：'))?text:null;}
function exactComponent(text:string,normalized:string):string|null{const escaped=normalized.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const found=text.match(new RegExp(escaped,'iu'))?.[0];return found&&found.normalize('NFKC').trim().toLowerCase().replace(/\s+/gu,' ')===normalized?found:null;}
export function validateCollectionOutput(raw:string,pages:FrozenCollectionPage[]):{candidates:WithdrawalLessonInput[];issues:CollectionIssue[]}{
 let parsed:unknown;try{parsed=JSON.parse(raw);}catch{return {candidates:[],issues:['invalid_json']};}
 const outer=z.object({candidates:z.array(z.unknown()).max(3)}).strict().safeParse(parsed);if(!outer.success)return {candidates:[],issues:['invalid_json']};
 const candidates:WithdrawalLessonInput[]=[],issues:CollectionIssue[]=[];const used=new Set<number>(),identities=new Set<string>();
 for(const entry of outer.data.candidates){
  if(!entry||typeof entry!=='object'||Array.isArray(entry)){issues.push('invalid_candidate');continue;}
  const object=entry as Record<string,unknown>,facts=Object.fromEntries(Object.entries(object).filter(([key])=>!analysisFields.includes(key as typeof analysisFields[number])));
  const fact=factSchema.safeParse(facts);if(!fact.success){issues.push('invalid_candidate');continue;}
  const page=pages[fact.data.pageIndex];if(!page||used.has(fact.data.pageIndex)||identities.has(page.issuer.subjectIdentityKey)){issues.push('source_mismatch');continue;}
  const parts=page.issuer.subjectIdentityKey.split('|'),scope=withdrawalScope.safeParse(parts[2]);
  const operator=parts.length===4?exactComponent(page.text,parts[0]):null,market=parts.length===4?exactComponent(page.text,parts[1]):null,name=parts.length===4?exactComponent(page.text,parts[3]):null;
  if(!operator||!market||!name||!scope.success){issues.push('unrecognized_subject');continue;}
  const explanationA=analysis(object.explanationA,true),explanationB=analysis(object.explanationB,true),distinguishingObservation=analysis(object.distinguishingObservation);
  const unknowns=Array.isArray(object.unknowns)?object.unknowns.slice(0,20).map(v=>analysis(v)).filter((v):v is string=>v!==null):[];
  if((object.explanationA!==null&&explanationA===null)||(object.explanationB!==null&&explanationB===null)||(object.distinguishingObservation!==null&&distinguishingObservation===null)||!Array.isArray(object.unknowns)||unknowns.length!==object.unknowns.length)issues.push('invalid_analysis');
  const {pageIndex,publishedOn,...data}=fact.data;void pageIndex;
  const lesson=withdrawalLessonInputSchema.safeParse({...data,subject:{name,operator,market,scope:scope.data,identityKey:page.issuer.subjectIdentityKey},source:{issuerId:page.issuer.id,url:page.url,text:page.text,capturedAt:page.capturedAt,publishedOn},offering:null,buyers:null,explanationA,explanationB,distinguishingObservation,unknowns});
  if(!lesson.success){issues.push('invalid_candidate');continue;}
  used.add(fact.data.pageIndex);identities.add(page.issuer.subjectIdentityKey);candidates.push(lesson.data);
 }
 return {candidates,issues:[...new Set(issues)].slice(0,30)};
}
