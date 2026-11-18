import {formatMoney,parseMoney,cashCurrency} from '@/lib/domains/business-teardowns/cash/domain';
import {simulationSetupSchema,simulationTurnSchema,type SimulationSetup} from '@/lib/domains/business-teardowns/simulation/domain';
export const setupFields=[['openingMinor','期初现金'],['initialStock','期初库存件数'],['unitPriceMinor','每件收款'],['unitCostMinor','每件采购付款'],['shipCostMinor','每件交付支出'],['capacityUnits','原每回合交付上限'],['leadRounds','原采购交期（0、1 或 2 回合）'],['orderLimitPerRound','原每回合新接单上限'],['changedOrderLimit','第 3 回合起新接单上限'],['changedCapacity','第 4 回合起交付上限'],['changedLeadRounds','第 2 回合起新采购交期（0、1 或 2）']] as const;
export type SetupDraft={caseId:string;title:string;currency:string;startDate:string;customerPays:string;hypotheticalConfirmed:boolean}&Record<typeof setupFields[number][0],string>;
export const blank=(caseId=''):SetupDraft=>({caseId,title:'',currency:'',startDate:'',customerPays:'',hypotheticalConfirmed:false,...Object.fromEntries(setupFields.map(([key])=>[key,'']))} as SetupDraft);
export const simulationSetupDraft=(s:SimulationSetup):SetupDraft=>({...blank(s.caseId),title:s.title,currency:s.currency,startDate:s.startDate,customerPays:s.customerPays,...Object.fromEntries(setupFields.map(([k])=>[k,k.endsWith('Minor')?formatMoney(s[k],s.currency):String(s[k])]))} as SetupDraft);
export function parseSimulationSetupDraft(d:SetupDraft){return simulationSetupSchema.parse({...d,...Object.fromEntries(setupFields.map(([k])=>{if(k.endsWith('Minor'))return [k,parseMoney(d[k],cashCurrency.parse(d.currency))];if(!/^\d+$/.test(d[k]))throw new Error('每个数量与金额都请明确填写非负整数；零也请亲手填写。');return [k,Number(d[k])];}))});}
export const turnFields=[['purchaseUnits','采购件数'],['cancelUnits','取消旧订单件数'],['acceptUnits','新接订单件数'],['shipUnits','交付件数']] as const;
export type TurnDraft=Record<typeof turnFields[number][0]|'reason'|'checkNext',string>;
export const blankTurn=():TurnDraft=>({purchaseUnits:'',cancelUnits:'',acceptUnits:'',shipUnits:'',reason:'',checkNext:''});
export function parseTurn(d:TurnDraft){return simulationTurnSchema.parse({...d,...Object.fromEntries(turnFields.map(([k])=>{if(!/^\d+$/.test(d[k]))throw new Error('每个动作数量都请明确填写整数；不做请填零。');return [k,Number(d[k])];}))});}
