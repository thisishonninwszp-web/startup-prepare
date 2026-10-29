import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;create table ideas(id uuid primary key,user_id uuid,title text,hypothesis jsonb,status text,last_activity_at timestamptz);create table idea_info_gaps(id uuid primary key,user_id uuid,idea_id uuid,question text,evidence jsonb default '[]',updated_at timestamptz);create table validations(id uuid primary key,idea_id uuid);create table reality_materials(id uuid primary key,user_id uuid,sanitized_text text,source_url text,source_type text);create table decision_observation_runs(id uuid primary key,user_id uuid,payload jsonb);`);
const sql=await readFile(new URL('../../../supabase/migrations/109_idea_experiments.sql',import.meta.url),'utf8');
await db.exec(sql);
const uuid=n=>`aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12,'0')}`;const user=uuid(1),other=uuid(2),idea=uuid(3),otherIdea=uuid(4),gap=uuid(5);
await db.query(`insert into auth.users values ($1),($2)`,[user,other]);await db.query(`insert into ideas values($1,$2,'test','{}','验证中','2000-01-01T00:00:00Z'),($3,$4,'other','{}','假设','2000-01-01T00:00:00Z')`,[idea,user,otherIdea,other]);await db.query(`insert into idea_info_gaps(id,user_id,idea_id,question) values($1,$2,$3,'question')`,[gap,user,idea]);await db.exec(`set request.jwt.claim.role='service_role'`);
const rpc=async(name,input,owner=user)=>(await db.query(`select public.${name}($1,$2::jsonb) result`,[owner,JSON.stringify(input)])).rows[0].result;
const version={ideaId:idea,gapId:gap,requestId:uuid(10),objective:'delivery',route:'prototype_test',accessContext:{publicSources:false,canRunPrototype:true,canPublishExample:false,canContactPeople:false},question:'deliver?',inputPlan:{scope:'synthetic examples'},steps:['run'],passCriterion:'correct output',failCriterion:'wrong output',limits:'selected synthetic inputs only',timeBudgetMinutes:null,costBudgetMinor:null,currency:null,deferredQuestions:['real pain?'],recheckOn:null};
const exp=await rpc('save_idea_experiment_version',version);assert.deepEqual(await rpc('save_idea_experiment_version',version),exp);await assert.rejects(rpc('save_idea_experiment_version',{...version,question:'changed'}),/payload conflict/);
await assert.rejects(rpc('save_idea_experiment_version',{...version,requestId:uuid(11),ideaId:otherIdea}),/idea unavailable/);
const caseInput={experimentId:exp.id,requestId:uuid(20),inputOrigin:'synthetic',inputText:'test input',sourceSnapshot:null,expectedOutput:'output'};const c=await rpc('append_idea_experiment_case',caseInput);await assert.rejects(rpc('append_idea_experiment_case',caseInput,other),/experiment unavailable/);
const publicInput={...caseInput,requestId:uuid(22),inputOrigin:'public',sourceSnapshot:{source_type:'web',url:'https://example.com/rule',publisher:'Example',published_at:null,captured_at:'2000-01-01T00:00:00Z',excerpt:'test input',hash:'client hash',capture_scope:'excerpt',truncated:false,missing_text:false}};
const publicCase=await rpc('append_idea_experiment_case',publicInput);
assert.deepEqual(await rpc('append_idea_experiment_case',{...publicInput,sourceSnapshot:{...publicInput.sourceSnapshot,captured_at:'2001-01-01T00:00:00Z',hash:'changed client hash'}}),publicCase);
const frozen=(await db.query('select source_snapshot from idea_experiment_cases where id=$1',[publicCase.id])).rows[0].source_snapshot;
assert.equal(frozen.hash.length,64);assert.ok(new Date(frozen.captured_at).getUTCFullYear()>2001);
await assert.rejects(rpc('append_idea_experiment_case',{...publicInput,requestId:uuid(23),inputText:'fabricated public task'}),/must equal/);
await db.query('insert into decision_observation_runs values($1,$2,$3::jsonb)',[uuid(24),user,JSON.stringify({records:[{origin:'synthetic',text:'test input',sourceUrl:'https://example.com/rule'}]})]);
await assert.rejects(rpc('append_idea_experiment_case',{...publicInput,requestId:uuid(25),sourceSnapshot:{...publicInput.sourceSnapshot,source_type:'observation_run',source_id:uuid(24)}}),/origin\/url\/quote mismatch/);
await db.query('update decision_observation_runs set payload=$1::jsonb where id=$2',[JSON.stringify({records:[{origin:'public',text:'test input',sourceUrl:'https://example.com/rule'}]}),uuid(24)]);
await assert.rejects(rpc('append_idea_experiment_case',{...publicInput,requestId:uuid(26),sourceSnapshot:{...publicInput.sourceSnapshot,source_type:'observation_run',source_id:uuid(24),url:'https://different.example/rule'}}),/origin\/url\/quote mismatch/);
await db.query('insert into reality_materials values($1,$2,$3,$4,$5)',[uuid(27),other,'test input','https://example.com/rule','url']);
await assert.rejects(rpc('append_idea_experiment_case',{...publicInput,requestId:uuid(28),sourceSnapshot:{...publicInput.sourceSnapshot,source_type:'material',source_id:uuid(27)}}),/material unavailable/);
const start={experimentId:exp.id,requestId:uuid(30)};const run=await rpc('start_idea_experiment_run',start);assert.deepEqual(await rpc('start_idea_experiment_run',start),run);
await rpc('append_idea_experiment_case',{...caseInput,requestId:uuid(21),inputText:'later'});
const result={caseId:c.id,executionContext:'self_run',outcome:'pass',actualOutput:{text:'output'},manualIntervention:'none',notes:''};const complete={runId:run.id,requestId:uuid(40),status:'completed',results:[result,{...result,caseId:publicCase.id}],actualMinutes:null,actualCostMinor:null,currency:null,outputArtifact:null};
await assert.rejects(rpc('complete_idea_experiment_run',{...complete,results:[]}),/manifest mismatch/);assert.equal((await db.query('select status from idea_experiment_runs where id=$1',[run.id])).rows[0].status,'running');
await assert.rejects(rpc('complete_idea_experiment_run',{...complete,outputArtifact:{material_id:uuid(27),description:'other owners material'}}),/material unavailable/);
assert.equal((await db.query('select count(*) n from idea_experiment_results')).rows[0].n,0);
await assert.rejects(rpc('complete_idea_experiment_run',{...complete,results:[result,result]}),/manifest mismatch/);
await rpc('complete_idea_experiment_run',complete);assert.deepEqual(await rpc('complete_idea_experiment_run',complete),run);await assert.rejects(rpc('complete_idea_experiment_run',{...complete,status:'failed'}),/payload conflict/);
await assert.rejects(db.query("update idea_experiment_cases set input_text='edited' where id=$1",[c.id]),/immutable/);
await assert.rejects(db.query('delete from idea_info_gaps where id=$1',[gap]),/foreign key/);
await rpc('attach_experiment_gap_ref',{gapId:gap,runId:run.id,requestId:uuid(50),note:'first'});await rpc('attach_experiment_gap_ref',{gapId:gap,runId:run.id,requestId:uuid(51),note:'second'});assert.equal((await db.query('select jsonb_array_length(evidence) n from idea_info_gaps')).rows[0].n,2);
assert.equal((await db.query('select count(*) n from validations')).rows[0].n,0);const unchanged=(await db.query('select status,last_activity_at from ideas where id=$1',[idea])).rows[0];assert.equal(unchanged.status,'验证中');assert.equal(new Date(unchanged.last_activity_at).getUTCFullYear(),2000);
await db.exec(`set role authenticated;set request.jwt.claim.role='authenticated'`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);assert.equal((await db.query('select count(*) n from idea_experiments')).rows[0].n,0);await assert.rejects(db.query('update idea_experiment_runs set status=\'failed\''),/permission denied/);
await db.close();console.log('Experiment PostgreSQL integration passed: owner isolation, idempotency, immutable snapshots, manifest rollback, atomic append, no validation/status/activity side effects.');





