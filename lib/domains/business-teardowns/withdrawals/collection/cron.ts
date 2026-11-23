import {randomUUID} from 'node:crypto';
import {businessJobOwner} from '../../jobs/owner';
import {withdrawalCommand} from '../transport';
import {executeWithdrawalCollection,type CollectionResult} from './executor';
export async function runWithdrawalCron():Promise<{selection:Awaited<ReturnType<typeof withdrawalCommand>>|null;collection:CollectionResult}>{
 const owner=await businessJobOwner();if(!owner)return {selection:null,collection:{status:'owner_only'}};
 let selection:Awaited<ReturnType<typeof withdrawalCommand>>|null;
 try{selection=await withdrawalCommand(owner,{operation:'select_today',requestId:randomUUID()});}
 catch(error){if(['42P01','42883','PGRST202','PGRST205'].includes((error as {code?:string}).code??''))return {selection:null,collection:{status:'schema_required'}};throw error;}
 return {selection,collection:await executeWithdrawalCollection(owner)};
}
