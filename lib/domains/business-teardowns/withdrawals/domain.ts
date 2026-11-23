import {z} from 'zod';
import {cashDate,cashUuid} from '../cash/domain';

export const withdrawalUuid=cashUuid;
export const withdrawalStamp=z.string().max(80).regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(Z|[+-]\d\d:\d\d)$/).refine(value=>cashDate.safeParse(value.slice(0,10)).success&&Number.isFinite(Date.parse(value)),'时间不正确');
const text=(maximum:number)=>z.string().trim().min(1).refine(value=>value.length<=maximum,'文字太长');
export const withdrawalScope=z.enum(['company','business','store','product']);
const token=(value:string)=>value.normalize('NFKC').trim().toLowerCase().replace(/\s+/gu,' ');
export function withdrawalIdentityKey(subject:{name:string;operator:string;market:string;scope:z.infer<typeof withdrawalScope>}):string{return [subject.operator,subject.market,subject.scope,subject.name].map(token).join('|');}
export const officialDomain=z.string().max(253).regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/).refine(value=>!value.endsWith('.localhost')&&!value.endsWith('.local'),'请输入公开网站的准确域名');
export const safeOfficialUrl=z.string().refine(value=>value.length<=2000).refine(value=>{
 if(!/^https:\/\//.test(value)||/[\s\u0000-\u001f\u007f-\u009f\\]/u.test(value)||/%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value))return false;
 try{const u=new URL(value),authority=value.slice(8).split(/[/?#]/,1)[0];return officialDomain.safeParse(u.hostname).success&&authority===u.hostname&&!u.username&&!u.password&&!u.port;}catch{return false;}
},'请输入没有登录信息的 HTTPS 官方原文网址');
export const withdrawalSubjectSchema=z.object({name:text(300).refine(v=>!v.includes('|')),operator:text(300).refine(v=>!v.includes('|')),market:text(300).refine(v=>!v.includes('|')),scope:withdrawalScope,identityKey:text(1000)}).strict().refine(value=>value.identityKey===withdrawalIdentityKey(value),'主体标识与名称、经营者、市场和范围不一致');
const sourceInput=z.object({issuerId:withdrawalUuid,url:safeOfficialUrl,text:text(60000),capturedAt:withdrawalStamp,publishedOn:cashDate.nullable()}).strict();
const bindingsSchema=z.object({subject:text(3000),phase:text(3000),announcedOn:text(3000).nullable(),effectiveOn:text(3000).nullable(),publishedOn:text(3000).nullable()}).strict();
const nullableText=text(3000).nullable();
const inputShape={subject:withdrawalSubjectSchema,event:z.enum(['exit','shrink','stop']),phase:z.enum(['announced','completed']),announcedOn:cashDate.nullable(),effectiveOn:cashDate.nullable(),source:sourceInput,eventQuote:text(3000),reasonQuote:nullableText,bindings:bindingsSchema,offering:z.null(),buyers:z.null(),explanationA:nullableText,explanationB:nullableText,distinguishingObservation:nullableText,unknowns:z.array(text(3000)).max(20)};
function supportsDate(quote:string,date:string){const [year,month,day]=date.split('-').map(Number);return [date,`${year}/${month}/${day}`,`${year}年${month}月${day}日`,`${year}年${String(month).padStart(2,'0')}月${String(day).padStart(2,'0')}日`].some(value=>quote.includes(value));}
export const withdrawalLessonInputSchema=z.object(inputShape).strict().superRefine((value,ctx)=>{
 const quotes=[value.eventQuote,value.reasonQuote,...Object.values(value.bindings)].filter((q):q is string=>q!==null);
 if(quotes.some(quote=>!value.source.text.includes(quote)))ctx.addIssue({code:'custom',message:'每项声明需要官方原文中的连续逐字出处'});
 if(!value.bindings.subject.includes(value.subject.name)||!value.bindings.subject.includes(value.subject.operator)||!value.bindings.subject.includes(value.subject.market))ctx.addIssue({code:'custom',message:'主体出处必须包含所填名称、经营者和市场'});
 if(Date.parse(value.source.capturedAt)>Date.now()+300000)ctx.addIssue({code:'custom',message:'取得原文的时间不能在未来'});
 for(const key of ['announcedOn','effectiveOn','publishedOn'] as const){const date=key==='publishedOn'?value.source.publishedOn:value[key],quote=value.bindings[key];if((date===null)!==(quote===null)||(date&&quote&&!supportsDate(quote,date)))ctx.addIssue({code:'custom',path:[key],message:'日期需要独立逐字出处；未知请留空'});}
 if(new TextEncoder().encode(JSON.stringify(value)).byteLength>250000)ctx.addIssue({code:'custom',message:'文字太长'});
});
export type WithdrawalLessonInput=z.infer<typeof withdrawalLessonInputSchema>;
export const withdrawalIssuerInputSchema=z.object({name:text(300),domain:officialDomain,subjectIdentityKey:text(1000)}).strict();
const revision=z.number().int().min(0).max(2147483646);
export const withdrawalCommandSchema=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('register_issuer'),id:withdrawalUuid,requestId:withdrawalUuid,issuer:withdrawalIssuerInputSchema,confirmed:z.literal(true)}).strict(),
 z.object({operation:z.literal('save'),id:withdrawalUuid,requestId:withdrawalUuid,expectedRevision:revision,lesson:withdrawalLessonInputSchema,confirmed:z.boolean()}).strict(),
 z.object({operation:z.literal('erase'),id:withdrawalUuid,requestId:withdrawalUuid,expectedRevision:revision.min(1)}).strict(),
 z.object({operation:z.literal('select_today'),requestId:withdrawalUuid}).strict(),
]);
export type WithdrawalCommand=z.infer<typeof withdrawalCommandSchema>;
export const withdrawalIssuerSchema=withdrawalIssuerInputSchema.extend({id:withdrawalUuid,createdAt:withdrawalStamp,confirmedAt:withdrawalStamp}).strict();
export type WithdrawalIssuer=z.infer<typeof withdrawalIssuerSchema>;
// Erased rows retain identifiers and hashes only; live rows undergo the full input validation.
export const withdrawalLessonSchema=z.object({id:withdrawalUuid,caseId:withdrawalUuid.nullable(),selectedOn:cashDate.nullable(),subject:z.object({name:z.string(),operator:z.string(),market:z.string(),scope:withdrawalScope,identityKey:z.string()}).strict(),event:inputShape.event,phase:inputShape.phase,announcedOn:cashDate.nullable(),effectiveOn:cashDate.nullable(),source:sourceInput.extend({text:z.string(),contentHash:z.string().regex(/^[a-f0-9]{64}$/)}),eventQuote:z.string(),reasonQuote:z.string().nullable(),bindings:z.object({subject:z.string(),phase:z.string(),announcedOn:z.string().nullable(),effectiveOn:z.string().nullable(),publishedOn:z.string().nullable()}).strict(),offering:z.null(),buyers:z.null(),explanationA:nullableText,explanationB:nullableText,distinguishingObservation:nullableText,unknowns:z.array(text(3000)).max(20),confirmed:z.boolean(),revision:revision.min(1),createdAt:withdrawalStamp,erasedAt:withdrawalStamp.nullable()}).strict().superRefine((value,ctx)=>{
 if(value.erasedAt){if(value.source.text||value.subject.name||value.subject.operator||value.subject.market||value.eventQuote||value.reasonQuote!==null||value.explanationA!==null||value.explanationB!==null||value.distinguishingObservation!==null||value.unknowns.length||Object.values(value.bindings).some(v=>v!==''&&v!==null)||value.confirmed)ctx.addIssue({code:'custom',message:'已清除的教材不能包含旧正文'});return;}
 const {contentHash,...source}=value.source;void contentHash;
 const parsed=withdrawalLessonInputSchema.safeParse({...Object.fromEntries(Object.keys(inputShape).map(key=>[key,value[key as keyof typeof value]])),source});
 if(!parsed.success)ctx.addIssue({code:'custom',message:'教材的原文与声明不一致'});
});
export type WithdrawalLesson=z.infer<typeof withdrawalLessonSchema>;
export const withdrawalCursorSchema=z.object({date:withdrawalStamp,id:withdrawalUuid}).strict();
export type WithdrawalPage<T>={available:boolean;items:T[];nextCursor:string|null};
