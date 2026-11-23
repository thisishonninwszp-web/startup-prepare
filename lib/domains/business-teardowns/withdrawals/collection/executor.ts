import {createHash,randomUUID} from 'node:crypto';
import {analyzeBusinessWithdrawals} from '@/lib/ai';
import type {tavilySearch} from '@/lib/external';
import {fetchPublicPage} from '@/app/(app)/materials/fetch-page';
import {extractArticleText} from '@/lib/domains/signals/rss';
import {businessJobOwner} from '../../jobs/owner';
import {collectionCommand,withdrawalCollectionEnabled,type CollectionOperation} from './transport';
import {collectionLeaseSchema,collectionRunSchema,collectionCandidateReceiptSchema,COLLECTION_LIMITS,COLLECTION_VALIDATOR,collectionQuery,registeredPage,type CollectionIssue} from './domain';
import {validateCollectionOutput,type FrozenCollectionPage} from './validation';
import {searchWithdrawalAnnouncements} from './providers';
export type CollectionDependencies={command:(operation:CollectionOperation,input?:Record<string,unknown>)=>Promise<unknown>;enabled:()=>boolean;allowedOwner:()=>Promise<boolean>;search:typeof tavilySearch;fetchPage:typeof fetchPublicPage;analyze:typeof analyzeBusinessWithdrawals;now:()=>Date};
export type CollectionResult={status:'disabled'|'owner_only'|'running'|'completed'|'failed'|'unknown'|'schema_required';saved?:number};
export function collectionDeterministicId(runId:string,key:string):string{const hash=createHash('sha256').update(`withdrawal-collection-v1:${runId}:${key}`).digest('hex').slice(0,32).split('');hash[12]='5';hash[16]='8';const value=hash.join('');return `${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20)}`;}
function fitArchive(raw:string){let text=raw.slice(0,120000);if(/[\uD800-\uDBFF]$/.test(text))text=text.slice(0,-1);return {raw:text,truncated:text.length!==raw.length};}
export async function executeWithdrawalCollection(owner:string,injected?:CollectionDependencies):Promise<CollectionResult>{
 const d:CollectionDependencies=injected??{command:(op,input={})=>collectionCommand(owner,op,input),enabled:withdrawalCollectionEnabled,allowedOwner:async()=>await businessJobOwner()===owner,search:searchWithdrawalAnnouncements,fetchPage:fetchPublicPage,analyze:analyzeBusinessWithdrawals,now:()=>new Date()};
 if(!d.enabled())return {status:'disabled'};if(!await d.allowedOwner())return {status:'owner_only'};
 let claimed:unknown;try{claimed=await d.command('claim',{requestId:randomUUID()});}catch(error){if(['42P01','42883','PGRST202','PGRST205'].includes((error as {code?:string}).code??''))return {status:'schema_required'};throw error;}
 if((claimed as {status?:string})?.status==='disabled')return {status:'disabled'};
 const parsed=collectionLeaseSchema.safeParse(claimed);if(!parsed.success){const existing=collectionRunSchema.parse(claimed);return {status:existing.status};}
 const lease=parsed.data,pin={runId:lease.id,token:lease.token,revision:lease.revision};
 let requests=0,saved=0,pageRequests=0;
 const check=async()=>{if(!d.enabled()||!await d.allowedOwner())throw new Error('collection stopped');await d.command('check',pin);};
 const reserve=async(kind:'search'|'page'|'ai',issuerId:string|null=null,url:string|null=null)=>{await check();const ticket=await d.command('ticket',{...pin,kind,issuerId,url,requestId:randomUUID()}) as {id:string};requests++;return ticket.id;};
 const settle=async(ticketId:string,status:'completed'|'failed')=>{await check();await d.command('settle',{...pin,ticketId,status,requestId:randomUUID()});};
 const archive=async(raw:string,issues:CollectionIssue[])=>{await check();await d.command('archive',{...pin,...fitArchive(raw),issues,validatorVersion:COLLECTION_VALIDATOR,requestId:randomUUID()});};
 try{
  const offset=Math.floor(Date.parse(`${lease.localDate}T00:00:00Z`)/86400000)%lease.issuers.length;
  const issuers=[...lease.issuers.slice(offset),...lease.issuers.slice(0,offset)].slice(0,COLLECTION_LIMITS.search);
  const links:{url:string;issuer:typeof issuers[number]}[]=[],seen=new Set<string>();
  for(const issuer of issuers){const ticket=await reserve('search');const found=await d.search(collectionQuery(issuer),6,[issuer.domain]);await settle(ticket,'completed');for(const hint of found){if(registeredPage(hint.url,issuer)&&!seen.has(hint.url)){seen.add(hint.url);links.push({url:hint.url,issuer});}}}
  const pages:FrozenCollectionPage[]=[],pageIssues:CollectionIssue[]=[];
  for(const link of links){
   if(pageRequests>=COLLECTION_LIMITS.page)break;const tickets:string[]=[];
   const result=await d.fetchPage(link.url,html=>extractArticleText(html,60000),{beforeRequest:async url=>{
    await check();if(!registeredPage(url,link.issuer))throw new Error('unregistered redirect');if(pageRequests>=COLLECTION_LIMITS.page)throw new Error('page budget exhausted');
    const ticket=await reserve('page',link.issuer.id,url);pageRequests++;tickets.push(ticket);
   }});
   await check();for(const ticket of tickets)await settle(ticket,result.ok?'completed':'failed');
   if(!result.ok){pageIssues.push('page_unavailable');continue;}
   if(!tickets.length||!registeredPage(result.finalUrl,link.issuer))throw new Error('uncontrolled official page');
   pages.push(Object.freeze({issuer:link.issuer,url:result.finalUrl,text:result.body.slice(0,60000),capturedAt:d.now().toISOString()}));
  }
  if(pages.length){
   const ticket=await reserve('ai');
   const raw=await d.analyze({ownerId:owner,runId:lease.id,requestId:collectionDeterministicId(lease.id,'analysis'),pages:pages.map(page=>({issuerId:page.issuer.id,subjectIdentityKey:page.issuer.subjectIdentityKey,url:page.url,text:page.text,capturedAt:page.capturedAt}))});
   await settle(ticket,'completed');const valid=validateCollectionOutput(raw,pages);await archive(raw,[...new Set([...pageIssues,...valid.issues])]);
   for(const lesson of valid.candidates){
    await check();const candidateId=collectionDeterministicId(lease.id,`candidate:${lesson.subject.identityKey}`),requestId=collectionDeterministicId(lease.id,`save:${lesson.subject.identityKey}`);
    const command={operation:'save',id:candidateId,requestId,expectedRevision:0,lesson,confirmed:false};
    const receipt=collectionCandidateReceiptSchema.parse(await d.command('save_candidate',{...pin,command,requestId:collectionDeterministicId(lease.id,`atomic:${lesson.subject.identityKey}`)}));
    if(receipt.status==='duplicate'){if(receipt.identityKey!==lesson.subject.identityKey)throw new Error('candidate identity receipt mismatch');continue;}
    if(receipt.id!==candidateId)throw new Error('candidate save receipt mismatch');saved++;
   }
  }else if(pageIssues.length)await archive('',[...new Set(pageIssues)]);
  await check();await d.command('complete',{...pin,requestId:randomUUID()});return {status:'completed',saved};
 }catch{
  // Any attempted I/O may have reached its provider; neither the request nor this owner/day is retried.
  const status=requests?'unknown':'failed';
  try{await d.command('terminate',{...pin,status,requestId:randomUUID()});}catch{return {status:'unknown',saved};}
  return {status,saved};
 }
}
