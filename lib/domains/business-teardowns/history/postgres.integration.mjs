import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(process.argv[2]).href),db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;create table observations(id uuid,user_id uuid,raw_text text);create table ideas(id uuid,user_id uuid,status text,last_activity_at timestamptz);create table validations(id uuid,idea_id uuid);create table career_entries(id uuid);`);
for(const name of ['119_business_teardown_foundation','120_business_teardown_research','135_business_operating_simulation','137_business_reality_checks'])await db.exec(await readFile(`supabase/migrations/${name}.sql`,'utf8'));
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';let serial=0;const id=()=>`20000000-0000-4000-8000-${String(++serial).padStart(12,'0')}`;
await db.query('insert into auth.users values($1),($2)',[owner,other]);await db.exec(`set request.jwt.claim.role='service_role'`);
const rpc=async(name,operation,input={},user=owner)=>(await db.query(`select ${name}($1,$2,$3::jsonb) result`,[user,operation,JSON.stringify(input)])).rows[0].result;
const command=(input,user=owner)=>rpc('business_followup_check_command',input.operation,input,user);
const legacy=(input,user=owner)=>rpc('business_reality_check_command',input.operation,input,user);
const results=(input,user=owner)=>rpc('business_reality_result_command',input.operation,input,user),resultRead=(operation,input={},user=owner)=>rpc('business_reality_result_read',operation,input,user);
const merchant=id(),caseId=id(),simulationId=id(),planId=id(),resultId=id(),followupId=id();
await db.query(`insert into business_merchants(id,user_id,platform,platform_shop_id,name,source_url,identity_scope) values($1,$2,'rakuten','fixture','CASE PROSE NEVER COPIED','https://example.com','platform_shop_id')`,[merchant,owner]);
await db.query(`insert into business_daily_cases(id,user_id,local_date,merchant_id,selection_reason) values($1,$2,'2026-11-19',$3,'fixture')`,[caseId,owner,merchant]);
const setup={caseId,title:'SIMULATION PROSE NEVER COPIED',currency:'JPY',startDate:'2026-11-19',openingMinor:1000,initialStock:0,unitPriceMinor:300,unitCostMinor:100,shipCostMinor:20,capacityUnits:10,leadRounds:0,customerPays:'order',orderLimitPerRound:10,changedOrderLimit:5,changedCapacity:2,changedLeadRounds:0,hypotheticalConfirmed:true};
await rpc('business_simulation_command','create',{operation:'create',id:simulationId,requestId:id(),expectedRevision:0,setup});
await rpc('business_simulation_command','turn',{operation:'turn',id:simulationId,requestId:id(),expectedRevision:1,turn:{purchaseUnits:0,acceptUnits:0,shipUnits:0,cancelUnits:0,reason:'SIMULATION REASON NEVER COPIED',checkNext:'SIMULATION NEXT NEVER COPIED'}});
const original={question:'ORIGINAL PLAN NEVER COPIED',falsifier:'本人の反証条件',method:'本人に聞く',dueDate:'2026-11-30'};
const createOriginal={operation:'save',id:planId,requestId:id(),expectedRevision:0,simulationId,round:1,plan:original,confirmed:true};await legacy(createOriginal);
// Only the last pre139 version is backfilled; earlier prose must not be imagined.
const pre139Id=id();await legacy({...createOriginal,id:pre139Id,requestId:id(),plan:{...original,question:'PRE139 VERSION ONE MUST NOT REAPPEAR'}});
await legacy({...createOriginal,id:pre139Id,requestId:id(),expectedRevision:1,plan:{...original,question:'PRE139 VERSION TWO MUST NOT REAPPEAR'}});
await legacy({...createOriginal,id:pre139Id,requestId:id(),expectedRevision:2,plan:{...original,question:'PRE139 RETAINED VERSION THREE'}});
await db.exec(await readFile('supabase/migrations/139_business_reality_results.sql','utf8'));
const body={checkedOn:'2000-02-29',examined:'SOURCE BODY LIVE ONLY',found:'独立した調査結果',sourceNote:'当事者への電話',sourceUrl:null,learned:'独立した学び'};
const append={operation:'append',id:resultId,requestId:id(),planId,planRevision:1,body,confirmed:true};await results(append);

await db.exec(await readFile('supabase/migrations/141_business_followup_checks.sql','utf8'));
await db.exec(await readFile('supabase/migrations/143_business_confirmation_history.sql','utf8'));
const history=(operation,input={},user=owner)=>rpc('business_confirmation_history_read',operation,input,user);
const first=await history('list');assert.equal(first.items.length,3);assert.equal(first.nextCursor,null);assert.equal(await history('get',{kind:'plan',id:pre139Id,revision:1}),null);assert.equal(await history('get',{kind:'plan',id:pre139Id,revision:2}),null);assert.equal((await history('get',{kind:'plan',id:pre139Id,revision:3})).plan.question,'PRE139 RETAINED VERSION THREE');assert.ok(!JSON.stringify(first).includes('MUST NOT REAPPEAR'));
for(const prose of ['CASE PROSE NEVER COPIED','SIMULATION PROSE NEVER COPIED','SIMULATION REASON NEVER COPIED','SIMULATION NEXT NEVER COPIED'])assert.ok(!JSON.stringify(first).includes(prose));
const version=await history('get',{kind:'plan',id:planId,revision:1});assert.deepEqual(version.plan,original);assert.deepEqual(version.parent,{kind:'simulation',id:simulationId,revision:2,available:true});
await rpc('business_simulation_command','turn',{operation:'turn',id:simulationId,requestId:id(),expectedRevision:2,turn:{purchaseUnits:0,acceptUnits:0,shipUnits:0,cancelUnits:0,reason:'LATER SIMULATION REASON',checkNext:'LATER SIMULATION NEXT'}});assert.deepEqual((await history('get',{kind:'plan',id:planId,revision:1})).parent,{kind:'simulation',id:simulationId,revision:2,available:true});
const savedResult=await history('get',{kind:'result',id:resultId});assert.deepEqual(savedResult.body,body);assert.deepEqual(savedResult.planSnapshot,original);assert.deepEqual(savedResult.parent,{kind:'plan',id:planId,revision:1,available:true});assert.equal(savedResult.at,(await resultRead('get',{id:resultId})).createdAt);
assert.equal(await history('get',{kind:'plan',id:planId,revision:1},other),null);assert.equal(await history('get',{kind:'result',id:resultId},other),null);assert.deepEqual((await history('list',{},other)).items,[]);
const changed={...createOriginal,requestId:id(),expectedRevision:1,plan:{...original,question:'UPDATED OWN QUESTION'}};await legacy(changed);assert.deepEqual((await history('get',{kind:'plan',id:planId,revision:1})).plan,original);assert.deepEqual((await history('get',{kind:'plan',id:planId,revision:2})).plan,changed.plan);assert.deepEqual((await history('get',{kind:'result',id:resultId})).planSnapshot,original);
const save={operation:'save',id:followupId,requestId:id(),expectedRevision:0,resultId,plan:{...original,question:'FOLLOWUP OWN QUESTION'},confirmed:true};await command(save);
assert.deepEqual((await history('get',{kind:'plan',id:followupId,revision:1})).parent,{kind:'result',id:resultId,revision:1,available:true});
const childResult=id();await results({...append,id:childResult,requestId:id(),planId:followupId});
await db.query(`insert into ideas values($1,$2,'验证中','2026-11-01T00:00:00Z')`,[id(),owner]);const beforeIdeas=(await db.query('select * from ideas')).rows;
// One plan with many retained revisions and a tied result exercises all four keyset columns.
for(let revision=2;revision<26;revision++)await legacy({...changed,requestId:id(),expectedRevision:revision,plan:{...original,question:`OWN VERSION ${revision+1}`}});
// Timestamp-only fixture changes retain plans exactly, avoiding capture mutation.
await db.exec(`alter table business_reality_check_versions disable trigger all;update business_reality_check_versions set saved_at='2026-11-19T00:00:00.123456Z';alter table business_reality_check_versions enable trigger all;update business_reality_results set created_at='2026-11-19T00:00:00.123456Z'`);
let page=await history('list',{caseId}),all=[...page.items];assert.equal(page.items.length,20);assert.ok(page.nextCursor);const exact=await history('get',{kind:'plan',id:planId,revision:1});assert.ok(exact);assert.ok(!page.items.some(n=>n.kind==='plan'&&n.id===planId&&n.revision===1));
while(page.nextCursor){page=await history('list',{caseId,before:page.nextCursor});all.push(...page.items);}assert.equal(all.length,30);assert.equal(new Set(all.map(n=>`${n.kind}:${n.id}:${n.revision}`)).size,all.length);assert.equal(all[0].kind,'result');assert.ok(all.every(n=>n.caseId===caseId));assert.equal((await history('list',{caseId:id()})).items.length,0);
for(const input of [{kind:'plan',id:planId},{kind:'result',id:resultId,revision:1},{kind:'plan',id:planId,revision:0},{kind:'plan',id:planId,revision:2147483648},{kind:'simulation',id:simulationId}])await assert.rejects(history('get',input));
for(const input of [{owner},{before:null},{before:{at:'2026-02-30T00:00:00Z',kind:'plan',id:planId,revision:1}},{before:{at:'2026-11-19T00:00:00Z',kind:'result',id:resultId,revision:2}},{before:{at:'2026-11-19T00:00:00Z',kind:'plan',id:planId,revision:1,extra:1}}])await assert.rejects(history('list',input));
await results({operation:'erase',id:resultId,requestId:id(),expectedRevision:1});assert.equal(await history('get',{kind:'result',id:resultId}),null);const orphan=await history('get',{kind:'plan',id:followupId,revision:1});assert.equal(orphan.parent.available,false);assert.equal(orphan.plan.question,'FOLLOWUP OWN QUESTION');assert.ok(!JSON.stringify(orphan).includes('SOURCE BODY LIVE ONLY'));
await command({operation:'erase',id:followupId,requestId:id(),expectedRevision:1});assert.equal(await history('get',{kind:'plan',id:followupId,revision:1}),null);const independent=await history('get',{kind:'result',id:childResult});assert.deepEqual(independent.body,body);assert.equal(independent.parent.available,false);assert.equal(independent.planSnapshot,null);assert.ok(independent.snapshotErasedAt);
await db.query('delete from business_simulations where id=$1',[simulationId]);assert.equal((await history('get',{kind:'plan',id:planId,revision:1})).parent.available,false);
assert.deepEqual((await db.query('select * from ideas')).rows,beforeIdeas);for(const table of ['observations','validations','career_entries'])assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n,0);
const helper='public.business_confirmation_history_nodes(uuid,uuid)';for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query(`select has_function_privilege($1,$2,'execute') allowed`,[role,helper])).rows[0].allowed,false);
await assert.rejects(history('list',{},null),error=>error.code==='42501');await assert.rejects(history('list',{},id()),error=>error.code==='42501');
await db.exec('set role service_role');assert.ok((await history('list')).items.length);for(const table of ['business_reality_check_versions','business_reality_results'])await assert.rejects(db.query(`select * from ${table}`));await db.exec('reset role');
for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(history('list'),error=>error.code==='42501');await db.exec('reset role');}
console.log('History actual119/120/135/137/139/141/143 passed: current-only139 backfill, exact retained revisions and parent metadata, immutable prior conditions, live erasure, two owners/private ACL,30 tied nodes and exact node beyond20, strict keysets, no unrelated writes.');await db.close();
