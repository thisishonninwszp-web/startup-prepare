import {z} from 'zod';
import {simulationSetupSchema,simulationTurnSchema,simulationDate,type SimulationSetup,type SimulationTurn} from './domain';
export type SimulationOrder={round:number;dueRound:number;units:number};
export type SimulationSupply={round:number;units:number};
export type SimulationFlow={label:string;inMinor:number;outMinor:number};
export type SimulationRound={round:number;date:string;arrivedUnits:number;stock:number;outstanding:number;overdue:number;cashMinor:number;minimumCashMinor:number;shortfall:boolean;inMinor:number;outMinor:number;flows:SimulationFlow[];leadRounds:number;capacityUnits:number;orderLimit:number};
export function replaySimulation(input:SimulationSetup,actions:SimulationTurn[]){
 const setup=simulationSetupSchema.parse(input),turns=z.array(simulationTurnSchema).max(6).parse(actions);let cash=setup.openingMinor,stock=setup.initialStock,minimumCashMinor=cash;
 let orders:SimulationOrder[]=[],supplies:SimulationSupply[]=[];const rounds:SimulationRound[]=[];
 function consume(units:number){for(const order of orders){const count=Math.min(units,order.units);order.units-=count;units-=count;}orders=orders.filter(o=>o.units>0);}
 for(const [i,turn] of turns.entries()){
  const round=i+1,leadRounds=round>=2?setup.changedLeadRounds:setup.leadRounds,capacityUnits=round>=4?setup.changedCapacity:setup.capacityUnits,orderLimit=round>=3?setup.changedOrderLimit:setup.orderLimitPerRound;
  let arrivedUnits=0,roundMinimum=cash;const flows:SimulationFlow[]=[];
  const flow=(label:string,inMinor:number,outMinor:number)=>{cash+=inMinor-outMinor;roundMinimum=Math.min(roundMinimum,cash);minimumCashMinor=Math.min(minimumCashMinor,cash);if(!Number.isSafeInteger(cash))throw new Error('假设金额超出安全整数范围');flows.push({label,inMinor,outMinor});};
  for(const supply of supplies.filter(s=>s.round===round)){stock+=supply.units;arrivedUnits+=supply.units;}supplies=supplies.filter(s=>s.round>round);
  if(turn.purchaseUnits){flow('假设采购付款',0,turn.purchaseUnits*setup.unitCostMinor);if(leadRounds===0){stock+=turn.purchaseUnits;arrivedUnits+=turn.purchaseUnits;}else supplies.push({round:round+leadRounds,units:turn.purchaseUnits});}
  if(turn.cancelUnits>orders.reduce((sum,o)=>sum+o.units,0))throw new Error('只能取消本回合开始前尚未交付的订单');
  if(turn.cancelUnits){consume(turn.cancelUnits);if(setup.customerPays==='order')flow('假设取消退款',0,turn.cancelUnits*setup.unitPriceMinor);}
  if(turn.acceptUnits>orderLimit)throw new Error('新接订单超过本回合上限');
  if(turn.acceptUnits){orders.push({round,dueRound:round+1,units:turn.acceptUnits});if(setup.customerPays==='order')flow('假设接单收款',turn.acceptUnits*setup.unitPriceMinor,0);}
  if(turn.shipUnits>Math.min(stock,capacityUnits,orders.reduce((sum,o)=>sum+o.units,0)))throw new Error('交付数量超过库存、产能或未交订单');
  if(turn.shipUnits){stock-=turn.shipUnits;consume(turn.shipUnits);if(setup.customerPays==='shipment')flow('假设交付收款',turn.shipUnits*setup.unitPriceMinor,0);flow('假设交付支出',0,turn.shipUnits*setup.shipCostMinor);}
  rounds.push({round,date:simulationDate(setup.startDate,i),arrivedUnits,stock,outstanding:orders.reduce((s,o)=>s+o.units,0),overdue:orders.filter(o=>round>=o.dueRound).reduce((s,o)=>s+o.units,0),cashMinor:cash,minimumCashMinor:roundMinimum,shortfall:roundMinimum<0,inMinor:flows.reduce((s,f)=>s+f.inMinor,0),outMinor:flows.reduce((s,f)=>s+f.outMinor,0),flows,leadRounds,capacityUnits,orderLimit});
 }
 return {rounds,orders,supplies,cashMinor:cash,minimumCashMinor,stock};
}
