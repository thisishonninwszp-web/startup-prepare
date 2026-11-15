export function createReadGeneration(){
 let current=0;
 return {next:()=>++current,current:()=>current,isCurrent:(generation:number)=>generation===current};
}
export async function readIfCurrent<T>(request:Promise<T>,isCurrent:()=>boolean):Promise<T|undefined>{
 try{const result=await request;return isCurrent()?result:undefined;}
 catch(error){if(isCurrent())throw error;return undefined;}
}
