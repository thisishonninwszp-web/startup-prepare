import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
process.on('uncaughtException',error=>{console.error(error.message,error.where??'');process.exit(1);});
const {PGlite}=await import(pathToFileURL(process.argv[2]).href),db=new PGlite();
const foundation=await readFile('lib/domains/business-teardowns/withdrawals/postgres.integration.mjs','utf8');
await eval(`(async()=>{${foundation.slice(foundation.indexOf('await db.exec(`create role'),foundation.indexOf("const owner='"))}})()`);
for(const name of ['147_business_explanation_plans','148_business_withdrawal_research','149_business_withdrawal_collection','150_business_workspace_explanations'])await db.exec(await readFile(`supabase/migrations/${name}.sql`,'utf8'));
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';let n=0;const id=()=>`40000000-0000-4000-8000-${String(++n).padStart(12,'0')}`;
await db.query('insert into auth.users values($1),($2)',[owner,other]);await db.exec("set request.jwt.claim.role='service_role'");
const command=async(op,input={},user=owner)=>(await db.query('select business_withdrawal_collection_command($1,$2,$3::jsonb) result',[user,op,JSON.stringify(input)])).rows[0].result;
const lessonCommand=async(input,user=owner)=>(await db.query('select business_withdrawal_command($1,$2,$3::jsonb) result',[user,input.operation,JSON.stringify(input)])).rows[0].result;
async function issuer(name,domain='north.example',user=owner){const issuerId=id();await lessonCommand({operation:'register_issuer',id:issuerId,requestId:id(),issuer:{name:'North official',domain,subjectIdentityKey:`north ltd|japan|business|${name.toLowerCase()}`},confirmed:true},user);return issuerId;}
function lesson(name,issuerId,domain='north.example'){const subjectQuote=`North Ltd operates ${name} in Japan.`;return {subject:{name,operator:'North Ltd',market:'Japan',scope:'business',identityKey:`north ltd|japan|business|${name.toLowerCase()}`},event:'stop',phase:'announced',announcedOn:null,effectiveOn:null,source:{issuerId,url:`https://${domain}/news`,text:`${subjectQuote} The business will stop.`,capturedAt:'2026-11-02T00:00:00Z',publishedOn:null},eventQuote:'The business will stop.',reasonQuote:null,bindings:{subject:subjectQuote,phase:'The business will stop.',announcedOn:null,effectiveOn:null,publishedOn:null},offering:null,buyers:null,explanationA:'假设：交付条件改变',explanationB:null,distinguishingObservation:null,unknowns:[]};}
async function run(issuerIds,user=owner){await command('settings',{enabled:true,issuerIds,publicTextConfirmed:true,policyVersion:'official-withdrawal-public-text-v1',expectedRevision:0,requestId:id()},user);const lease=await command('claim',{requestId:id()},user);return {runId:lease.id,token:lease.token,revision:lease.revision};}
const archiveInput=(pin,raw='The business will stop. 假设：交付条件改变')=>({...pin,raw,issues:['invalid_analysis'],validatorVersion:'withdrawal-collection-v1',truncated:true,requestId:id()});
const archivedRow=async receipt=>(await db.query('select * from business_withdrawal_collection_archives where id=$1',[receipt.id])).rows[0];
async function save(pin,value,user=owner){for(const kind of ['page','ai']){const ticket=await command('ticket',{...pin,kind,issuerId:kind==='page'?value.source.issuerId:null,url:kind==='page'?value.source.url:null,requestId:id()},user);await command('settle',{...pin,ticketId:ticket.id,status:'completed',requestId:id()},user);}const input={...pin,command:{operation:'save',id:id(),requestId:id(),expectedRevision:0,lesson:value,confirmed:false},requestId:id()};return {input,receipt:await command('save_candidate',input,user)};}
async function erase(lessonId,user=owner){return lessonCommand({operation:'erase',id:lessonId,expectedRevision:1,requestId:id()},user);}
async function scenario(name,work){await db.exec('begin');try{await work();console.log(name+' passed');}finally{await db.exec('rollback');}}

await scenario('accepted multi-candidate batch, metadata/owner scope, late archive and replay',async()=>{
 const alpha=await issuer('Alpha'),beta=await issuer('Beta'),pin=await run([alpha,beta]);const earlyInput=archiveInput(pin),early=await command('archive',earlyInput);const alphaSave=await save(pin,lesson('Alpha',alpha));
 // A second candidate in the same frozen batch shares the one completed analysis ticket.
 const betaPage=await command('ticket',{...pin,kind:'page',issuerId:beta,url:'https://north.example/news',requestId:id()});await command('settle',{...pin,ticketId:betaPage.id,status:'completed',requestId:id()});
 const betaInput={...pin,command:{operation:'save',id:id(),requestId:id(),expectedRevision:0,lesson:lesson('Beta',beta),confirmed:false},requestId:id()};await command('save_candidate',betaInput);
 const lateBeforeErase=await command('archive',archiveInput(pin));
 const foreignIssuer=await issuer('Alpha','north.example',other),foreignPin=await run([foreignIssuer],other),foreign=await command('archive',archiveInput(foreignPin,'foreign owner prose'),other);
 const unrelatedIssuer=await issuer('Unrelated'),unrelatedRun=id(),unrelatedArchive=id();await db.query("insert into business_withdrawal_collection_runs(id,user_id,local_date,status,token,settings_revision,issuer_ids,expires_at) values($1,$2,business_today()-1,'completed',$3,1,array[$4::uuid],clock_timestamp())",[unrelatedRun,owner,id(),unrelatedIssuer]);await db.query("insert into business_withdrawal_collection_archives(id,user_id,run_id,raw,issues,validator_version,truncated) values($1,$2,$3,'unrelated prose','[]','withdrawal-collection-v1',false)",[unrelatedArchive,owner,unrelatedRun]);
 await erase(alphaSave.receipt.id);
 for(const receipt of [early,lateBeforeErase]){const row=await archivedRow(receipt);assert.equal(row.raw,'');assert.deepEqual(row.issues,['invalid_analysis']);assert.equal(row.validator_version,'withdrawal-collection-v1');assert.equal(row.truncated,true);}
 assert.equal((await archivedRow(foreign)).raw,'foreign owner prose');assert.equal((await archivedRow({id:unrelatedArchive})).raw,'unrelated prose');
 const late=await command('archive',archiveInput(pin));assert.equal((await archivedRow(late)).raw,'');assert.deepEqual(await command('archive',earlyInput),early);assert.equal((await archivedRow(early)).raw,'');
 assert.equal((await command('save_candidate',alphaSave.input)).status,'saved');assert.equal((await archivedRow(early)).raw,'');
});
await scenario('duplicate existing lesson with alternate registry identity',async()=>{
 const primary=await issuer('Alpha'),alternate=await issuer('Alpha','alternate.example'),lessonId=id();await lessonCommand({operation:'save',id:lessonId,requestId:id(),expectedRevision:0,lesson:lesson('Alpha',primary),confirmed:false});
 const pin=await run([alternate]),before=await command('archive',archiveInput(pin));assert.equal((await save(pin,lesson('Alpha',alternate,'alternate.example'))).receipt.status,'duplicate');await erase(lessonId);assert.equal((await archivedRow(before)).raw,'');
});
await scenario('already erased identity blocks preassociation and duplicate late archives',async()=>{
 const primary=await issuer('Alpha'),lessonId=id();await lessonCommand({operation:'save',id:lessonId,requestId:id(),expectedRevision:0,lesson:lesson('Alpha',primary),confirmed:false});await erase(lessonId);
 const alternate=await issuer('Alpha','alternate.example'),pin=await run([alternate]);const before=await command('archive',archiveInput(pin));assert.equal((await archivedRow(before)).raw,'');assert.equal((await save(pin,lesson('Alpha',alternate,'alternate.example'))).receipt.status,'duplicate');assert.equal((await archivedRow(before)).raw,'');
 // Simulate retained historical raw: the duplicate path itself must clear it immediately.
 await db.query('update business_withdrawal_collection_archives set raw=$1 where id=$2',['old retained prose',before.id]);assert.equal((await command('save_candidate',{...pin,requestId:id(),command:{operation:'save',id:id(),requestId:id(),expectedRevision:0,lesson:lesson('Alpha',alternate,'alternate.example'),confirmed:false}})).status,'duplicate');assert.equal((await archivedRow(before)).raw,'');
});
await scenario('erasure during I/O before candidate save and canonical-source-only erasure',async()=>{
 const alpha=await issuer('Alpha'),pin=await run([alpha]),lessonId=id();await lessonCommand({operation:'save',id:lessonId,requestId:id(),expectedRevision:0,lesson:lesson('Alpha',alpha),confirmed:false});
 const before=await command('archive',archiveInput(pin));await db.query("update business_withdrawal_sources set captured_text='',erased_at=clock_timestamp() where user_id=$1 and id=$2",[owner,lessonId]);assert.equal((await archivedRow(before)).raw,'');const after=await command('archive',archiveInput(pin));assert.equal((await archivedRow(after)).raw,'');
});
console.log('Collection149 physical erasure passed; no provider/production calls.');await db.close();
