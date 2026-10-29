import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;create table observations(id uuid primary key default gen_random_uuid(),user_id uuid,raw_text text,tags text[]);create table ideas(id uuid primary key,user_id uuid,title text);`);
for(const name of ['119_business_teardown_foundation','120_business_teardown_research','121_business_teardown_jobs'])await db.exec(await readFile(`supabase/migrations/${name}.sql`,'utf8'));
const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002';let serial=0;const id=()=>`30000000-0000-4000-8000-${String(++serial).padStart(12,'0')}`;
await db.query('insert into auth.users values($1),($2)',[a,b]);await db.exec(`set request.jwt.claim.role='service_role'`);
const call=async(op,input={},owner=a)=>(await db.query('select business_job_command($1,$2,$3::jsonb) result',[owner,op,JSON.stringify(input)])).rows[0].result;
const source={mode:'search',keyword:'道具',category:'tools',priceBand:'mixed',businessModel:'retail'};
const settings={enabled:true,prepareOnOpen:false,schedule:'07:00',httpBudget:8,aiBudget:1,sources:[source],excluded:[],autoAI:false,policyVersion:'official-rakuten-scalars-v1'};
let state=await call('state');assert.equal(state.settings.enabled,false);assert.equal(state.settings.schedule,'07:00');
for(const field of ['httpBudget','aiBudget'])for(const invalid of [null,undefined,'2',1.5,-1]){const bad={...settings,[field]:invalid,expectedRevision:0,requestId:id()};await assert.rejects(call('settings',bad),undefined,`${field} rejects ${String(invalid)}`);}
for(const badSource of [{...source,mode:null},{...source,category:12},{...source,genreId:null},{...source,keyword:null}])await assert.rejects(call('settings',{...settings,sources:[badSource],expectedRevision:0,requestId:id()}));
await assert.rejects(call('settings',{...settings,autoAI:'true',autoAIConfirmed:true,expectedRevision:0,requestId:id()}));
await assert.rejects(call('settings',{...settings,autoAI:true,autoAIConfirmed:'true',expectedRevision:0,requestId:id()}));
let saved=await call('settings',{...settings,expectedRevision:0,requestId:id()});assert.equal(saved.revision,1);
const receiptInput={...settings,expectedRevision:1,requestId:id()};saved=await call('settings',receiptInput);assert.deepEqual(await call('settings',receiptInput),saved);await assert.rejects(call('settings',{...receiptInput,httpBudget:9}),/conflict/);
await assert.rejects(call('settings',{...settings,expectedRevision:0,requestId:id()}),/revision/);
const run=await call('claim',{trigger:'manual'});assert.equal(run.status,'running');assert.equal(run.localDate,(await db.query('select business_today()::text d')).rows[0].d);
assert.equal((await call('claim',{trigger:'manual'})).status,'busy');await assert.rejects(call('check',run,b),/owner|run|unavailable/);
const ticket=await call('ticket',{...run,kind:'http',stage:'discovery',requestId:id()});await call('settle',{...run,ticketId:ticket.id,status:'completed',usage:null});
await assert.rejects(call('settle',{...run,ticketId:ticket.id,status:'failed',usage:0}),/conflict/);
const candidate={merchant:{platform:'rakuten',platformShopId:'tools',name:'Tools',sourceUrl:'https://www.rakuten.co.jp/tools/',identityScope:'platform_shop_id'},itemCode:'tools:item',itemName:'Item',itemUrl:'https://item.rakuten.co.jp/tools/item/',price:{itemPrice:100},reviewCount:null,rank:null,coverage:'keyword search page=1',category:'tools',priceBand:'low',businessModel:'retail',sourcePage:1,capturedAt:new Date().toISOString()};
await call('enqueue',{...run,candidates:[candidate],sourceCursor:{sourceKey:'0',nextPage:2,coverage:'keyword search page=1',capturedAt:new Date().toISOString()}});assert.equal((await call('state')).sourceCursors['0'],2);
const reserved=await call('reserve',{...run,candidate,ruleVersion:'business-rotation-v1',reason:'deterministic'});assert.ok(reserved.caseId);assert.equal((await db.query('select count(*)::int n from business_daily_cases')).rows[0].n,1);
const snapshot={platform:'rakuten',itemId:'tools:item',origin:'official_api',sourceUrl:candidate.itemUrl,publishedAt:null,captureScope:'api_fields',capturedText:null,quantities:[],structured:{itemName:'Item',itemPrice:100},coverage:'official fields page=1'};
const inspect=await call('ticket',{...run,kind:'http',stage:'inspect',requestId:id()});await call('settle',{...run,ticketId:inspect.id,status:'completed',usage:null});
await call('material',{...run,merchant:candidate.merchant,snapshot});assert.equal((await db.query('select state from business_daily_cases')).rows[0].state,'ready');
assert.equal((await call('ai_start',run)).status,'not_permitted');
await call('complete',{...run,status:'materials_ready',message:'automatic AI not permitted'});assert.equal((await call('claim',{trigger:'manual'})).status,'materials_ready');
assert.equal((await call('state')).attempts.length,2);assert.equal((await call('state')).attempts[0].usage,null);
// A later date is a separate slot, with no replacement of a previous main shop.
await db.exec(`create or replace function business_today() returns date language sql stable as $$select '2099-10-29'::date$$`);
saved=await call('settings',{...settings,autoAI:true,autoAIConfirmed:true,expectedRevision:saved.revision,requestId:id()});
const run2=await call('claim',{trigger:'manual'});await assert.rejects(call('reserve',{...run2,candidate,ruleVersion:'business-rotation-v1',reason:'reuse'}),/used|excluded/);
const second={...candidate,merchant:{...candidate.merchant,platformShopId:'second',sourceUrl:'https://www.rakuten.co.jp/second/'},itemCode:'second:item',itemUrl:'https://item.rakuten.co.jp/second/item/'};
await call('enqueue',{...run2,candidates:[second]});await call('reserve',{...run2,candidate:second,ruleVersion:'business-rotation-v1',reason:'rotate'});
await db.exec(`create or replace function business_today() returns date language sql stable as $$select '2099-10-30'::date$$`);
await call('material',{...run2,merchant:second.merchant,snapshot:{...snapshot,itemId:second.itemCode,sourceUrl:second.itemUrl}});
assert.equal((await db.query('select local_date::text d from business_daily_cases where id=(select case_id from business_job_runs where id=$1)',[run2.runId])).rows[0].d,'2099-10-29');
// An existing A snapshot contains public query metadata; B's outbound scalar
// projection still permits reuse without sending arbitrary nested fields.
await db.exec('alter table business_material_snapshots disable trigger business_snapshot_immutable');await db.query(`update business_material_snapshots set structured=structured||'{"query":{"itemCode":"second:item"},"privateNested":{"text":"must not leave"}}'::jsonb where item_id='second:item'`);await db.exec('alter table business_material_snapshots enable trigger business_snapshot_immutable');
const started=await call('ai_start',run2);assert.equal(started.status,'ready');
await call('verify_ai',{...run2,draftLease:started.lease});
const keys=['offering','trigger','buyers','volume','journey','value','operations','economics','comparison','failure_conditions','transfer','experiment'];const report={sections:keys.map(key=>({key,observations:[],interpretations:[],unknowns:['未知']})),model:'mock',promptVersion:'v1'};
await assert.rejects(call('finish',{...run2,draftLease:started.lease,report}),/ticket/);
const aiTicket=await call('ticket',{...run2,kind:'ai',stage:'report',requestId:id()});await call('settle',{...run2,ticketId:aiTicket.id,status:'completed',usage:null});await assert.rejects(call('ticket',{...run2,kind:'ai',stage:'report',requestId:id()}),/budget|retry|unknown/);
// Report finish, publication, and run terminal receipt roll back together.
await db.exec(`create function reject_job_finish() returns trigger language plpgsql as $$begin if new.status='completed' then raise exception 'forced rollback';end if;return new;end$$;create trigger reject_job_finish before update on business_job_runs for each row execute function reject_job_finish();`);
await assert.rejects(call('finish',{...run2,draftLease:started.lease,report}),/forced rollback/);assert.equal((await db.query('select count(*)::int n from business_case_revisions')).rows[0].n,0);assert.equal((await db.query('select published_revision_id from business_daily_cases where id=$1',[started.lease.caseId])).rows[0].published_revision_id,null);await db.exec('drop trigger reject_job_finish on business_job_runs');
await db.query('update business_daily_cases set published_revision_id=$1 where id=$2',[id(),started.lease.caseId]);await assert.rejects(call('finish',{...run2,draftLease:started.lease,report}),/publication/);assert.equal((await db.query('select count(*)::int n from business_case_revisions')).rows[0].n,0);await db.query('update business_daily_cases set published_revision_id=null where id=$1',[started.lease.caseId]);
const finished=await call('finish',{...run2,draftLease:started.lease,report});assert.equal(finished.status,'completed');assert.deepEqual(await call('finish',{...run2,draftLease:started.lease,report}),finished);
await db.exec(`create or replace function business_today() returns date language sql stable as $$select '2099-10-30'::date$$`);
const run3=await call('claim',{trigger:'manual'});const third={...second,merchant:{...second.merchant,platformShopId:'third',sourceUrl:'https://www.rakuten.co.jp/third/'},itemCode:'third:item',itemUrl:'https://item.rakuten.co.jp/third/item/'};await call('enqueue',{...run3,candidates:[third]});await call('reserve',{...run3,candidate:third,ruleVersion:'business-rotation-v1',reason:'rotate'});await call('material',{...run3,merchant:third.merchant,snapshot:{...snapshot,itemId:third.itemCode,sourceUrl:third.itemUrl}});const pending=await call('ai_start',run3);
await call('settings',{...settings,autoAI:false,expectedRevision:saved.revision,requestId:id()});await assert.rejects(call('verify_ai',{...run3,draftLease:pending.lease}),/settings|consent|revoked/);
await assert.rejects(db.query('select business_report_command($1,\'verify\',$2::jsonb)',[a,JSON.stringify(pending.lease)]),/settings|consent|revoked/);
await assert.rejects(call('finish',{...run3,draftLease:pending.lease,report}),/settings|consent|revoked/);
// A run created yesterday cannot reserve tomorrow's 119 slot.
await db.exec(`create or replace function business_today() returns date language sql stable as $$select '2099-10-31'::date$$`);
saved=await call('settings',{...settings,httpBudget:2,expectedRevision:saved.revision+1,requestId:id()});const midnight=await call('claim',{trigger:'manual'});await db.exec(`create or replace function business_today() returns date language sql stable as $$select '2099-11-01'::date$$`);await assert.rejects(call('reserve',{...midnight,candidate:third,ruleVersion:'business-rotation-v1',reason:'late'}),/date/);
await call('ticket',{...midnight,kind:'http',stage:'discovery',requestId:id()});await assert.rejects(call('ticket',{...midnight,kind:'http',stage:'discovery',requestId:id()}),/budget|unknown|pending/);
await db.query(`update business_job_runs set lease_until=clock_timestamp()-interval '1 second' where id=$1`,[midnight.runId]);await assert.rejects(call('check',midnight),/lease/);
assert.ok((await call('history')).items.some(x=>x.status==='failed'||x.status==='unknown'||x.status==='completed'));
saved=await call('settings',{...settings,sources:[],expectedRevision:saved.revision,requestId:id()});assert.equal((await call('state')).candidates.length,0);
await call('settings',{...settings,expectedRevision:0,requestId:id()},b);const concurrent=await Promise.all([call('claim',{trigger:'manual'},b),call('claim',{trigger:'manual'},b)]);assert.equal(concurrent.filter(r=>r.status==='running').length,1);assert.equal(concurrent.filter(r=>r.status==='busy').length,1);
const owned=concurrent.find(r=>r.status==='running');await db.query(`update business_job_runs set lease_until=clock_timestamp()-interval '1 second' where id=$1`,[owned.runId]);assert.equal((await call('claim',{trigger:'manual'},b)).status,'unknown');assert.equal((await call('claim',{trigger:'manual'},b)).status,'unknown');
// A manual preparation with no primary material remains the same slot even if
// the automatic worker cannot inspect it; writing the failure receipt succeeds.
await db.exec(`create or replace function business_today() returns date language sql stable as $$select '2099-11-02'::date$$`);await db.query('select business_prepare_case($1,$2::jsonb)',[b,JSON.stringify({requestId:id(),userInputHash:'manual',merchant:candidate.merchant,selectionReason:'manual'})]);const manualRun=await call('claim',{trigger:'manual'},b);assert.ok(manualRun.caseId);assert.equal((await call('fail',{...manualRun,message:'manual source needs attention'},b)).status,'failed');assert.equal((await db.query('select count(*)::int n from business_daily_cases where user_id=$1',[b])).rows[0].n,1);
// All history can be reached, including runs that never created a case.
for(let day=1;day<=25;day++)await db.query(`insert into business_job_runs(user_id,local_date,status,trigger,settings_revision,settings,message) values($1,$2,'failed','manual',1,'{}','no candidate')`,[b,`2088-01-${String(day).padStart(2,'0')}`]);const historyPage=await call('history',{},b);assert.equal(historyPage.items.length,20);assert.ok(historyPage.nextCursor);const historyTail=await call('history',{before:historyPage.nextCursor},b);assert.equal(historyTail.items.length,7);assert.equal(historyTail.nextCursor,null);assert.equal(new Set([...historyPage.items,...historyTail.items].map(x=>x.runId)).size,27);
await db.exec(`set request.jwt.claim.role='authenticated'`);await assert.rejects(call('state'),e=>e.code==='42501');
console.log('121 PostgreSQL: settings receipts, owner guards, Tokyo slots, tickets, budgets, parent revocation, leases, no duplicate AI and atomic report publication passed');await db.close();

