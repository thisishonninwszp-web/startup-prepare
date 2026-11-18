import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {replaySimulation} from './engine';
import type {SimulationSetup,SimulationTurn} from './domain';
async function main(){
 const {PGlite}=await import(pathToFileURL(process.argv[2]).href),db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;create table business_merchants(id uuid primary key,user_id uuid,name text);create table business_daily_cases(id uuid primary key,user_id uuid,merchant_id uuid,created_at timestamptz default clock_timestamp(),local_date date);`);
 await db.exec(await readFile('supabase/migrations/135_business_operating_simulation.sql','utf8'));
 const base:SimulationSetup={caseId:'10000000-0000-4000-8000-000000000001',title:'合成回放测试，非商家数据',currency:'CNY',startDate:'2026-11-17',openingMinor:100,initialStock:10,unitPriceMinor:300,unitCostMinor:100,shipCostMinor:20,capacityUnits:10,leadRounds:0,customerPays:'order',orderLimitPerRound:10,changedOrderLimit:5,changedCapacity:2,changedLeadRounds:0,hypotheticalConfirmed:true};
 const empty:SimulationTurn={purchaseUnits:0,acceptUnits:0,shipUnits:0,cancelUnits:0,reason:'合成测试动作',checkNext:'合成测试核对'};
 const actions:SimulationTurn[]=[{...empty,purchaseUnits:3,acceptUnits:5,shipUnits:1},{...empty,purchaseUnits:2,cancelUnits:1,acceptUnits:4,shipUnits:3},{...empty,purchaseUnits:2,acceptUnits:2,shipUnits:2},{...empty,cancelUnits:1,acceptUnits:2,shipUnits:2},{...empty,purchaseUnits:2,acceptUnits:2,shipUnits:2},{...empty,cancelUnits:1,shipUnits:2}];
 let count=0;
 for(const customerPays of ['order','shipment'] as const)for(const leadRounds of [0,1,2])for(const changedLeadRounds of [0,1,2]){
  const setup={...base,customerPays,leadRounds,changedLeadRounds};
  for(let length=0;length<=6;length++){
   const turns=actions.slice(0,length),ts=replaySimulation(setup,turns),sql=(await db.query('select business_simulation_replay($1::jsonb,$2::jsonb) result',[JSON.stringify(setup),JSON.stringify(turns)])).rows[0].result;
   assert.deepEqual(sql,{cashMinor:ts.cashMinor,minimumCashMinor:ts.minimumCashMinor,stock:ts.stock,orders:ts.orders,supplies:ts.supplies});count++;
  }
 }
 const maxSetup={...base,openingMinor:1e9,unitCostMinor:1e9,unitPriceMinor:1e9,shipCostMinor:1e9,initialStock:100000,capacityUnits:100000,orderLimitPerRound:100000,changedOrderLimit:100000,changedCapacity:100000};
 const maxTurns=Array.from({length:6},()=>({...empty,purchaseUnits:100000,acceptUnits:100000,shipUnits:100000}));const ts=replaySimulation(maxSetup,maxTurns),sql=(await db.query('select business_simulation_replay($1::jsonb,$2::jsonb) result',[JSON.stringify(maxSetup),JSON.stringify(maxTurns)])).rows[0].result;assert.deepEqual(sql,{cashMinor:ts.cashMinor,minimumCashMinor:ts.minimumCashMinor,stock:ts.stock,orders:ts.orders,supplies:ts.supplies});
 console.log(`Simulation actual135 TS/PostgreSQL parity passed: ${count+1} exact replay comparisons including six maximum-unit rounds.`);await db.close();
}
void main();
