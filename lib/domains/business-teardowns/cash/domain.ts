import {z} from 'zod';
export const cashUuid=z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,'记录标识不正确').toLowerCase();
export const cashCurrency=z.enum(['JPY','CNY','USD','EUR']);
export type CashCurrency=z.infer<typeof cashCurrency>;
export const cashDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T00:00:00Z');return v>='1900-01-01'&&v<='2200-12-31'&&Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;},'请填写 1900 至 2200 年间的有效日期');
const money=z.number().int().min(0).max(1e12);
const text=(max:number)=>z.string().trim().min(1,'请写清这项假设').max(max);
export const cashFlowSchema=z.object({id:cashUuid,date:cashDate,label:text(300),direction:z.enum(['in','out']),amountMinor:money,assumption:text(3000)}).strict();
export const cashScenarioSchema=z.object({caseId:cashUuid,title:text(300),currency:cashCurrency,startDate:cashDate,openingMinor:money,baseline:z.array(cashFlowSchema).max(200),alternative:z.array(cashFlowSchema).max(200)}).strict().superRefine((v,ctx)=>{
 const encodedBytes=(value:string)=>new TextEncoder().encode(JSON.stringify(value)).byteLength;let textBytes=encodedBytes(v.title);
 for(const key of ['baseline','alternative'] as const){const ids=new Set<string>();let total=v.openingMinor;for(const [i,f] of v[key].entries()){if(ids.has(f.id))ctx.addIssue({code:'custom',path:[key,i,'id'],message:'同一方案的流水标识不能重复'});ids.add(f.id);if(f.date<v.startDate)ctx.addIssue({code:'custom',path:[key,i,'date'],message:'收付款日不能早于起始日'});total+=f.amountMinor;}if(!Number.isSafeInteger(total))ctx.addIssue({code:'custom',path:[key],message:'金额总和超出安全整数范围'});}
 for(const f of [...v.baseline,...v.alternative])textBytes+=encodedBytes(f.label)+encodedBytes(f.assumption);if(textBytes>700000)ctx.addIssue({code:'custom',message:'文字太长，请精简假设说明后再保存'});
});
export type CashFlow=z.infer<typeof cashFlowSchema>;
export type CashScenario=z.infer<typeof cashScenarioSchema>;
const commandBase={id:cashUuid,requestId:cashUuid,expectedRevision:z.number().int().min(0).max(2147483646)};
const commandSchema=z.discriminatedUnion('operation',[z.object({...commandBase,operation:z.literal('save'),scenario:cashScenarioSchema}).strict(),z.object({...commandBase,operation:z.literal('erase'),expectedRevision:commandBase.expectedRevision.min(1)}).strict()]);
export type CashCommand=z.infer<typeof commandSchema>;
export function parseCashCommand(value:unknown):CashCommand{return commandSchema.parse(value);}
export function parseMoney(value:string,currency:CashCurrency):number{
 cashCurrency.parse(currency);const raw=value.trim(),pattern=currency==='JPY'?/^\d+$/:/^\d+(?:\.\d{1,2})?$/;
 if(!pattern.test(raw)||raw.length>24)throw new Error(currency==='JPY'?'日元请填写非负整数':'金额请填写非负数，最多两位小数');
 const [whole,fraction='']=raw.split('.');const minor=BigInt(whole)*BigInt(currency==='JPY'?1:100)+BigInt(currency==='JPY'?'0':fraction.padEnd(2,'0'));
 if(minor>BigInt('1000000000000'))throw new Error('每项金额最多为一万亿最小币种单位');return Number(minor);
}
export function formatMoney(minor:number,currency:CashCurrency):string{
 cashCurrency.parse(currency);if(!Number.isSafeInteger(minor))throw new Error('金额不是安全整数');const v=BigInt(minor),sign=v<BigInt(0)?'-':'',n=v<BigInt(0)?-v:v;if(currency==='JPY')return `${sign}${n}`;return `${sign}${n/BigInt(100)}.${String(n%BigInt(100)).padStart(2,'0')}`;
}
export type CashDay={date:string;flows:CashFlow[];inMinor:number;outMinor:number;balanceMinor:number};
export type CashLedger={days:CashDay[];firstNegativeDate:string|null;minimumMinor:number;closingMinor:number};
export function calculateCash(input:CashScenario):{baseline:CashLedger;alternative:CashLedger}{
 const scenario=cashScenarioSchema.parse(input);
 function ledger(flows:CashFlow[]):CashLedger{const groups=new Map<string,CashFlow[]>([[scenario.startDate,[]]]);for(const f of flows)groups.set(f.date,[...(groups.get(f.date)??[]),f]);let balance=scenario.openingMinor,minimum:number|null=null,firstNegativeDate:string|null=null;const days:CashDay[]=[];
  for(const date of [...groups.keys()].sort()){const rows=groups.get(date)!;let incoming=0,outgoing=0;for(const f of rows){if(f.direction==='in')incoming+=f.amountMinor;else outgoing+=f.amountMinor;}balance+=incoming-outgoing;if(!Number.isSafeInteger(balance))throw new Error('金额总和超出安全整数范围');minimum=minimum===null?balance:Math.min(minimum,balance);if(balance<0&&!firstNegativeDate)firstNegativeDate=date;days.push({date,flows:rows,inMinor:incoming,outMinor:outgoing,balanceMinor:balance});}
  return {days,firstNegativeDate,minimumMinor:minimum??scenario.openingMinor,closingMinor:balance};}
 return {baseline:ledger(scenario.baseline),alternative:ledger(scenario.alternative)};
}
export type CashRecord={id:string;scenario:CashScenario;revision:number;createdAt:string;updatedAt:string;sources:{caseAvailable:boolean;caseTitle:string|null}};
export type CashPage={available:boolean;items:CashRecord[];nextCursor:string|null};
export type CashCase={id:string;title:string;date:string};
export type CashCasePage={items:CashCase[];nextCursor:string|null};
export type CashContext={caseId:string;caseTitle:string}|null;
