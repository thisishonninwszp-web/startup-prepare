import {z} from 'zod';
import {cashCurrency,cashDate,cashUuid} from '../cash/domain';
export const simulationUuid=cashUuid;
const units=z.number().int().min(0).max(100000),money=z.number().int().min(0).max(1e9),text=(max:number)=>z.string().trim().min(1,'请写下这一项').refine(v=>v.length<=max,'文字太长');
export const simulationSetupSchema=z.object({caseId:simulationUuid,title:text(300),currency:cashCurrency,startDate:cashDate,openingMinor:money,initialStock:units,unitPriceMinor:money,unitCostMinor:money,shipCostMinor:money,capacityUnits:units.min(1),leadRounds:z.number().int().min(0).max(2),customerPays:z.enum(['order','shipment']),orderLimitPerRound:units,changedOrderLimit:units,changedCapacity:units,changedLeadRounds:z.number().int().min(0).max(2),hypotheticalConfirmed:z.literal(true)}).strict().refine(v=>cashDate.safeParse(v.startDate).success&&simulationDate(v.startDate,5)<='2200-12-31','六回合日期不能超过 2200 年');
export const simulationTurnSchema=z.object({purchaseUnits:units,acceptUnits:units,shipUnits:units,cancelUnits:units,reason:text(3000),checkNext:text(3000)}).strict();
const base={id:simulationUuid,requestId:simulationUuid,expectedRevision:z.number().int().min(0).max(7)};
export const simulationCommandSchema=z.discriminatedUnion('operation',[z.object({...base,operation:z.literal('create'),expectedRevision:z.literal(0),setup:simulationSetupSchema}).strict(),z.object({...base,operation:z.literal('turn'),expectedRevision:base.expectedRevision.min(1).max(6),turn:simulationTurnSchema}).strict(),z.object({...base,operation:z.literal('erase'),expectedRevision:base.expectedRevision.min(1)}).strict()]);
export type SimulationSetup=z.infer<typeof simulationSetupSchema>;
export type SimulationTurn=z.infer<typeof simulationTurnSchema>;
export type SimulationCommand=z.infer<typeof simulationCommandSchema>;
export type SimulationRecord={id:string;setup:SimulationSetup;turns:SimulationTurn[];revision:number;createdAt:string;updatedAt:string;sources:{caseAvailable:boolean;caseTitle:string|null}};
export type SimulationCase={id:string;title:string;date:string};
export type SimulationContext={caseId:string;caseTitle:string}|null;
export type SimulationPage<T>={items:T[];nextCursor:string|null};
export type SimulationList=SimulationPage<SimulationRecord>&{available:boolean};
export function simulationDate(start:string,offset:number){return new Date(Date.parse(start+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);}
export function simulationTransition(base:{id:string;revision:number},incoming:{id:string;revision:number}|null,pending=false):'missing'|'conflict'|'refresh'{return !incoming||incoming.id!==base.id?'missing':pending||incoming.revision!==base.revision?'conflict':'refresh';}
export function simulationRequest(previous:{signature:string;requestId:string}|null,input:unknown,id:()=>string){const signature=JSON.stringify(input);return previous?.signature===signature?previous:{signature,requestId:id()};}
