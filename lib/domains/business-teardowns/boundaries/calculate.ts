import {calculateCash,cashScenarioSchema,type CashScenario} from '../cash/domain';
import {boundarySideSchema,boundaryVariableSchema,type BoundaryDefinition} from './domain';
export type BoundaryPoint<T=number>={value:T;negative:boolean;minimumMinor:number;firstNegativeDate:string|null;closingMinor:number};
export type MoneyBoundary={kind:'money';direction:'improves'|'worsens';classification:'all-negative'|'none-negative'|'transition';endpoints:[BoundaryPoint,BoundaryPoint];transition:{lower:BoundaryPoint;upper:BoundaryPoint}|null;evaluations:number};
export type DateBoundary={kind:'dates';points:BoundaryPoint<string>[];negativeIntervals:{from:string;to:string}[];evaluations:number};
export function coalesceNegativeDates(points:{value:string;negative:boolean}[]):{from:string;to:string}[]{const intervals:{from:string;to:string}[]=[];for(const [i,p] of points.entries()){if(!p.negative)continue;if(i>0&&points[i-1].negative)intervals[intervals.length-1].to=p.value;else intervals.push({from:p.value,to:p.value});}return intervals;}
export function calculateBoundary(input:CashScenario,definition:Pick<BoundaryDefinition,'side'|'variable'>):MoneyBoundary|DateBoundary{
 const scenario=cashScenarioSchema.parse(input),side=boundarySideSchema.parse(definition.side),v=boundaryVariableSchema.parse(definition.variable);
 const flow=v.kind==='opening'?null:scenario[side].find(f=>f.id===v.flowId);if(v.kind!=='opening'&&!flow)throw new Error('所选流水在此方案中不存在');if(v.kind==='date'&&v.from<scenario.startDate)throw new Error('收付款日不能早于起始日');
 const cache=new Map<string,BoundaryPoint<number|string>>();
 function evaluate<T extends number|string>(value:T):BoundaryPoint<T>{const key=String(value),old=cache.get(key);if(old)return old as BoundaryPoint<T>;const changed:CashScenario=v.kind==='opening'?{...scenario,openingMinor:value as number}:{...scenario,[side]:scenario[side].map(f=>f.id===flow!.id?{...f,...(v.kind==='amount'?{amountMinor:value as number}:{date:value as string})}:f)};const ledger=calculateCash(changed)[side];const point={value,negative:ledger.minimumMinor<0,minimumMinor:ledger.minimumMinor,firstNegativeDate:ledger.firstNegativeDate,closingMinor:ledger.closingMinor};cache.set(key,point);return point;}
 if(v.kind==='date'){const points:BoundaryPoint<string>[]=[];for(let day=Date.parse(v.from);day<=Date.parse(v.to);day+=86400000)points.push(evaluate(new Date(day).toISOString().slice(0,10)));return {kind:'dates',points,negativeIntervals:coalesceNegativeDates(points),evaluations:cache.size};}
 const direction=v.kind==='opening'||flow!.direction==='in'?'improves':'worsens';const first=evaluate(v.minMinor),last=evaluate(v.maxMinor);let transition:MoneyBoundary['transition']=null;
 if(first.negative!==last.negative){let lower=v.minMinor,upper=v.maxMinor;while(upper-lower>1){const mid=lower+Math.floor((upper-lower)/2),point=evaluate(mid);if(direction==='improves'?!point.negative:point.negative)upper=mid;else lower=mid;}transition={lower:evaluate(lower),upper:evaluate(upper)};}
 return {kind:'money',direction,classification:transition?'transition':first.negative?'all-negative':'none-negative',endpoints:[first,last],transition,evaluations:cache.size};
}
