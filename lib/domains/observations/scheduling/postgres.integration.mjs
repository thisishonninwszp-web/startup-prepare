import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table statistical_source_configs(id uuid primary key,user_id uuid,table_id text,filters jsonb,metadata_hash text,approval_state text,approved_at timestamptz,deleted_at timestamptz);
create table statistical_snapshots(id uuid primary key default gen_random_uuid(),user_id uuid,config_id uuid,payload jsonb,request_id uuid unique);
create function persist_statistical_snapshot_internal(p_user_id uuid,p_config_id uuid,p_payload jsonb,p_request_id uuid) returns jsonb language plpgsql as $$declare result uuid;begin insert into statistical_snapshots(user_id,config_id,payload,request_id) values(p_user_id,p_config_id,p_payload,p_request_id) returning id into result;return jsonb_build_object('id',result);end$$;
create table ideas(id uuid,status text,last_activity_at timestamptz);create table validations(id uuid);insert into ideas values(gen_random_uuid(),'验证中','2020-01-01');`);
await db.exec(await readFile(new URL('../../../../supabase/migrations/118_observation_scheduling.sql',import.meta.url),'utf8'));
const id=n=>`eeeeeeee-eeee-4eee-8eee-${String(n).padStart(12,'0')}`,owner=id(1),other=id(2),config=id(3);
await db.query('insert into auth.users values($1),($2)',[owner,other]);await db.query("insert into statistical_source_configs values($1,$2,'0004006264','{}','hash','approved',now(),null)",[config,owner]);await db.exec("set request.jwt.claim.role='service_role'");
const scalar=async(sql,args=[])=>(await db.query(sql,args)).rows[0].result;
const before=await scalar('select jsonb_agg(to_jsonb(i)) result from ideas i');
const settings={configId:config,enabled:true,intervalMinutes:60,dailyBudget:3,maxAttempts:3};
const save=(schedule,revision,body,n,who=owner)=>scalar('select save_observation_schedule($1,$2,$3,$4,$5) result',[who,schedule,revision,body,id(n)]);
const claim=(schedule=null,who=null)=>scalar('select claim_observation_schedule($1,$2) result',[who,schedule]);
const begin=r=>scalar('select begin_observation_request($1,$2) result',[r.id,r.token]);
const finish=(r,success=true,error=null)=>scalar('select finish_observation_run($1,$2,$3,$4,$5) result',[r.id,r.token,success,success?{metadataHash:'hash',sourceType:'live'}:null,error]);
const s=await save(null,null,settings,10);assert.deepEqual(await save(null,null,settings,10),s);await assert.rejects(save(null,null,{...settings,dailyBudget:9},10),/request payload conflict/);
await assert.rejects(save(null,null,settings,11,other),e=>e.code==='42501');
const workers=await Promise.all([claim(s.id,owner),claim(s.id,owner)]);assert.equal(workers.filter(Boolean).length,1);
const run=workers.find(Boolean);assert.equal(run.reserved,2);assert.equal(await claim(s.id,owner),null);
await assert.rejects(begin({...run,token:id(99)}),e=>e.code==='42501');
await begin(run);await begin(run);await assert.rejects(begin(run),/request allowance/);
const done=await finish(run);assert.ok(done.snapshotId);assert.deepEqual(await finish(run),done);assert.equal(await scalar('select count(*)::int result from statistical_snapshots'),1);
let current=await save(s.id,s.revision,settings,12);await db.query('update observation_schedules set next_run_at=now() where id=$1',[s.id]);assert.equal(await claim(s.id,owner),null);assert.equal(await scalar('select health result from observation_schedules where id=$1',[s.id]),'blocked');
current=await save(s.id,current.revision,{...settings,dailyBudget:8},13);const pending=await claim(s.id,owner);await begin(pending);
const paused=await save(s.id,current.revision,{...settings,enabled:false,dailyBudget:8},14);await assert.rejects(begin(pending),/lease|disabled/);await assert.rejects(finish(pending),/lease|disabled/);assert.equal(await scalar('select count(*)::int result from statistical_snapshots'),1);
current=await save(s.id,paused.revision,{...settings,dailyBudget:12},15);const expired=await claim(s.id,owner);await begin(expired);await db.query("update observation_schedule_runs set lease_until=now()-interval '1 second' where id=$1",[expired.id]);await assert.rejects(finish(expired),/lease/);const replacement=await claim(s.id,owner);assert.equal(replacement,null);assert.equal(await scalar('select status result from observation_schedule_runs where id=$1',[expired.id]),'expired');
await db.query('update observation_schedules set next_run_at=now() where id=$1',[s.id]);const invalidate=await claim(s.id,owner);await db.query("update statistical_source_configs set approval_state='deleted',deleted_at=now() where id=$1",[config]);await assert.rejects(begin(invalidate),/source/);await assert.rejects(finish(invalidate),/source/);assert.equal(await scalar('select count(*)::int result from statistical_snapshots'),1);
assert.deepEqual(await scalar('select jsonb_agg(to_jsonb(i)) result from ideas i'),before);assert.equal(await scalar('select count(*)::int result from validations'),0);
// A normal failed one-request attempt refunds only the unattempted reservation.
await db.query("update statistical_source_configs set approval_state='approved',deleted_at=null where id=$1",[config]);
current=await save(s.id,current.revision,{...settings,dailyBudget:30,maxAttempts:2},20);
const failed=await claim(s.id,owner);await begin(failed);const chargedBefore=await scalar('select charged result from observation_schedule_budgets where schedule_id=$1 and budget_day=$2',[s.id,failed.budget_day]);
await finish(failed,false,'provider_request_failed');assert.equal(await scalar('select charged result from observation_schedule_budgets where schedule_id=$1 and budget_day=$2',[s.id,failed.budget_day]),chargedBefore-1);
await db.query('update observation_schedules set next_run_at=now() where id=$1',[s.id]);const failure2=await claim(s.id,owner);await begin(failure2);await finish(failure2,false,'provider_request_failed');assert.equal(await scalar('select health result from observation_schedules where id=$1',[s.id]),'failed');assert.equal(await claim(s.id,owner),null);
// An expired reservation remains fully charged even if the user pauses before cleanup.
current=await save(s.id,current.revision,{...settings,dailyBudget:30},21);const crashed=await claim(s.id,owner);await begin(crashed);await db.query("update observation_schedule_runs set lease_until=now()-interval '1 second' where id=$1",[crashed.id]);
const chargedCrash=await scalar('select charged result from observation_schedule_budgets where schedule_id=$1 and budget_day=$2',[s.id,crashed.budget_day]);
current=await save(s.id,current.revision,{...settings,dailyBudget:30,enabled:false},22);assert.equal(await scalar('select charged result from observation_schedule_budgets where schedule_id=$1 and budget_day=$2',[s.id,crashed.budget_day]),chargedCrash);
assert.equal(await scalar('select status result from observation_schedule_runs where id=$1',[crashed.id]),'expired');
// Simulate a lease crossing the Tokyo natural-day boundary: a new HTTP must not use yesterday's reservation.
current=await save(s.id,current.revision,{...settings,dailyBudget:30},23);const midnight=await claim(s.id,owner);await db.query("update observation_schedule_runs set budget_day=budget_day-1 where id=$1",[midnight.id]);await assert.rejects(begin(midnight),/lease/);
await db.exec("set request.jwt.claim.role='authenticated'");await assert.rejects(claim(s.id,owner),e=>e.code==='42501');await assert.rejects(save(s.id,current.revision,settings,16),e=>e.code==='42501');
await db.exec('set role authenticated');await assert.rejects(db.query('select * from observation_schedule_runs'),e=>e.code==='42501');await db.exec('reset role');
console.log('Scheduling SQL: idempotency, ownership, budgets, lease fencing, pause/inflight discard, source deletion, expiry and no idea effects passed');await db.close();

