import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const migration='supabase/migrations/122_business_teardown_followups.sql';
let sql;
try {sql=await readFile(migration,'utf8');} catch(error) {assert.fail(`D learning migration is required before integration behavior can pass: ${migration} (${error.code})`);}
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;
create schema auth;create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
create table observations(id uuid primary key default gen_random_uuid(),user_id uuid,raw_text text,tags text[]);
create table ideas(id uuid primary key,user_id uuid,title text,hypothesis jsonb,status text,last_activity_at timestamptz);
create table idea_info_gaps(id uuid primary key,user_id uuid,idea_id uuid,question text,evidence jsonb default '[]',updated_at timestamptz);
create table validations(id uuid primary key,idea_id uuid);
create table reality_materials(id uuid primary key,user_id uuid,sanitized_text text,source_url text,source_type text);
create table decision_observation_runs(id uuid primary key,user_id uuid,payload jsonb);`);
for(const name of ['109_idea_experiments','119_business_teardown_foundation','120_business_teardown_research','121_business_teardown_jobs'])await db.exec(await readFile(`supabase/migrations/${name}.sql`,'utf8'));
await db.exec(sql);
const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002';
let serial=0,day=0;
const id=()=>`40000000-0000-4000-8000-${String(++serial).padStart(12,'0')}`;
await db.query('insert into auth.users values($1),($2)',[a,b]);
await db.exec(`set request.jwt.claim.role='service_role'`);
const query=async(text,args=[])=> (await db.query(text,args)).rows;
const scalar=async(text,args=[])=>Object.values((await query(text,args))[0])[0];
const command=async(input,owner=a,operation=input.operation)=>scalar('select business_learning_command($1,$2,$3::jsonb)',[owner,operation,JSON.stringify(input)]);
const read=async(caseId,owner=a,before=null)=>scalar('select business_learning_read($1,$2,$3)',[owner,caseId,before]);
const readAll=async(caseId,owner=a)=>{const items=[];let before=null;do {const page=await read(caseId,owner,before);items.push(...page.items);before=page.nextCursor;}while(before);return items;};
const search=async(text='',owner=a,before=null)=>scalar('select business_method_search($1,$2,$3)',[owner,text,before]);
const report=async(op,input,owner=a)=>scalar('select business_report_command($1,$2,$3::jsonb)',[owner,op,JSON.stringify(input)]);
const clock=async(value)=>db.exec(`create or replace function business_learning_now() returns timestamptz language sql volatile as $$select '${value}'::timestamptz$$`);
// The test controls only its isolated database clock; RPC callers never supply a timestamp.
await clock('2100-01-01T12:00:00Z');
const merchant=async(shop,owner=a,name='Same name')=>{
 const merchantId=id();await query(`insert into business_merchants(id,user_id,platform,platform_shop_id,name,source_url,identity_scope) values($1,$2,'rakuten',$3,$4,'https://example.com','platform_shop_id')`,[merchantId,owner,shop,name]);return merchantId;
};
const makeCase=async(merchantId,owner=a)=>{
 const caseId=id();await query(`insert into business_daily_cases(id,user_id,local_date,merchant_id,state,selection_reason) values($1,$2,'2090-01-01'::date+$3::int,$4,'ready','synthetic fixture')`,[caseId,owner,++day,merchantId]);return caseId;
};
const snapshot=async(caseId,merchantId,text='original public source',captured='2099-12-01T12:00:00Z',owner=a,options={})=>{
 const snapshotId=id();await query(`insert into business_material_snapshots(id,user_id,merchant_id,platform,item_id,origin,source_url,captured_at,published_at,capture_scope,captured_text,quantities,structured,coverage,content_hash) values($1,$2,$3,'rakuten',$7,$8,'https://example.com',$4,null,$9,$5,'[]',$6,'one item','fixture')`,[snapshotId,owner,merchantId,captured,text,JSON.stringify(options.structured??{}),options.itemId??'fixture:item',options.origin??'public_excerpt',options.origin==='manual_excerpt'?'manual_transcription':'excerpt']);
 await query(`insert into business_case_members(user_id,case_id,snapshot_id,merchant_id,role,selection_reason) values($1,$2,$3,$4,'product','fixture')`,[owner,caseId,snapshotId,merchantId]);return snapshotId;
};
const frozenReport=async(caseId,snapshotId,owner=a)=>{
 const reportId=id();const sections=[{key:'volume',observations:[],interpretations:[{text:'source interpretation',refs:[{snapshotId,quote:'original public source'}],competingExplanation:'coverage is limited',distinguishingObservation:'same scope check'}],unknowns:[]}];
 await query(`insert into business_case_revisions(id,user_id,case_id,revision,material_revision,manifest,input_manifest_hash,payload) values($1,$2,$3,1,1,$4,'fixture',$5)`,[reportId,owner,caseId,JSON.stringify([{id:snapshotId,capturedText:'original public source'}]),JSON.stringify({sections,authorship:'ai_draft'})]);return reportId;
};
const left=await merchant('left'),right=await merchant('right'),third=await merchant('third'),unrelated=await merchant('unrelated'),foreign=await merchant('foreign',b);
const leftCase=await makeCase(left),rightCase=await makeCase(right),foreignCase=await makeCase(foreign,b);
const baseline=await snapshot(leftCase,left),otherBaseline=await snapshot(foreignCase,foreign,'foreign private source','2099-12-01T12:00:00Z',b);
const reportId=await frozenReport(leftCase,baseline),foreignReport=await frozenReport(foreignCase,otherBaseline,b);
const link=(l,r,version,action='link')=>({operation:'identity',requestId:id(),caseId:leftCase,expectedVersion:version,leftMerchantId:l,rightMerchantId:r,leftSource:'official shop disclosure L',rightSource:'official shop disclosure R',reason:'user verified matching operator',confirmed:true,action});
const expectation=(overrides={})=>({operation:'expectation',requestId:id(),caseId:leftCase,reportId,baselineSnapshotId:baseline,question:'Will the same SKU retain this displayed range?',scope:'same SKU; same public displayed period',deadline:'2100-01-02T12:00:00Z',supportCriteria:'same SKU range remains',refuteCriteria:'explicit range falls',...overrides});
const method=(overrides={})=>({operation:'method',requestId:id(),caseId:leftCase,reportId,method:'Independent method',scenario:'same SKU public records',conditions:'have matching public periods',failureConditions:'promotion period changed',unknowns:'actual orders remain unknown',confirmed:true,...overrides});
const initial=await read(leftCase);assert.equal(initial.available,true);assert.equal(initial.version,0);assert.deepEqual(initial.items,[]);assert.deepEqual(initial.duplicateCaseIds,[]);
assert.equal(initial.merchants.filter(m=>m.name==='Same name').length,4,'same names remain independent metadata');assert.ok(initial.merchants.some(m=>m.merchantId===unrelated),'unrelated owned merchants remain independently visible');assert.ok(initial.merchants.every(m=>m.merchantId!==foreign));assert.ok(!JSON.stringify(initial.merchants).includes('original public source'));
for(const owner of [null,b]){await assert.rejects(command(link(left,right,0),owner));await assert.rejects(read(leftCase,owner));}
await assert.rejects(search('',null));await assert.rejects(command({...link(left,right,0),expectedVersion:'0'}));await assert.rejects(command({...link(left,right,0),confirmed:'true'}));await assert.rejects(command({...link(left,right,0),rightSource:''}));await assert.rejects(command(link(left,foreign,0)));await assert.rejects(command(link(left,left,0)));
const identityInput=link(left,right,0),identity=await command(identityInput);assert.equal(identity.operation,'identity');assert.deepEqual(await command(identityInput),identity,'receipt replay precedes stale CAS');
await assert.rejects(command({...identityInput,reason:'changed'}));await assert.rejects(command(link(right,third,0)),/version|conflict/);
for(const operation of ['identity','expectation','followup','correction','method'])await assert.rejects(command({operation,requestId:id(),caseId:leftCase}));
await command(link(right,third,1));const linked=await read(leftCase);assert.equal(linked.version,2);assert.ok(linked.duplicateCaseIds.includes(rightCase));assert.equal(await scalar('select count(*)::int from business_daily_cases'),3,'link keeps both historical cases');
let excluded=await scalar('select business_excluded_merchants($1)',[a]);assert.ok(excluded.includes('rakuten:third'),'chain closure excludes an unseen shop');assert.ok(!excluded.includes('rakuten:unrelated'));
// Both direct insertion and the manual A entry point must enforce the same graph exclusion.
await assert.rejects(makeCase(third));
await db.exec(`create or replace function business_today() returns date language sql stable as $$select '2100-01-10'::date$$`);
const manual={operation:'primary',requestId:id(),userInputHash:'manual-third',merchant:{platform:'rakuten',platformShopId:'third',name:'Same name',sourceUrl:'https://example.com',identityScope:'platform_shop_id'},selectionReason:'manual'};
await assert.rejects(scalar('select business_prepare_case($1,$2::jsonb)',[a,JSON.stringify(manual)]));
await assert.rejects(scalar('select business_save_case_material($1,$2::jsonb)',[a,JSON.stringify({...manual,snapshot:{platform:'rakuten',itemId:'third:item',origin:'public_excerpt',sourceUrl:'https://example.com',publishedAt:null,captureScope:'excerpt',capturedText:'public excerpt',quantities:[],structured:{},coverage:'one item'}})]),'manual material save cannot bypass identity exclusion');
const job=async(op,input)=>scalar('select business_job_command($1,$2,$3::jsonb)',[a,op,JSON.stringify(input)]);
await job('settings',{requestId:id(),expectedRevision:0,enabled:true,prepareOnOpen:false,schedule:'07:00',httpBudget:8,aiBudget:1,sources:[{mode:'search',keyword:'synthetic',category:'tools',priceBand:'mixed',businessModel:'retail'}],excluded:[],autoAI:false,policyVersion:'official-rakuten-scalars-v1'});
const run=await job('claim',{trigger:'manual'});
const linkedCandidate={merchant:{platform:'rakuten',platformShopId:'third',name:'Same name',sourceUrl:'https://www.rakuten.co.jp/third/',identityScope:'platform_shop_id'},itemCode:'third:item',itemName:'Synthetic item',itemUrl:'https://item.rakuten.co.jp/third/item/',price:{itemPrice:100},reviewCount:null,rank:null,coverage:'synthetic page',category:'tools',priceBand:'low',businessModel:'retail',sourcePage:1,capturedAt:'2100-01-01T12:00:00Z'};
await job('enqueue',{...run,candidates:[linkedCandidate]});
await assert.rejects(job('reserve',{...run,candidate:linkedCandidate,ruleVersion:'business-rotation-v1',reason:'synthetic'}),/used|excluded/,'automatic C reservation respects transitive identity links');
await command(link(right,third,2,'revoke'));excluded=await scalar('select business_excluded_merchants($1)',[a]);assert.ok(!excluded.includes('rakuten:third'));assert.equal((await read(leftCase)).version,3);
await makeCase(third);assert.equal((await read(leftCase)).items.filter(x=>x.operation==='identity').length,3,'revoke appends history');
// Service guards must run before parsing untrusted payload or cursor.
await db.exec(`set request.jwt.claim.role='authenticated'`);
await assert.rejects(command({bad:true}),e=>e.code==='42501');await assert.rejects(read(leftCase),e=>e.code==='42501');await assert.rejects(search(),e=>e.code==='42501');
await db.exec(`set request.jwt.claim.role='service_role'`);
for(const patch of [{createdAt:'2000-01-01'},{madeAt:'2000-01-01'},{deadline:'2099-01-01'},{question:null},{scope:9},{baselineSnapshotId:otherBaseline},{reportId:foreignReport},{unexpectedField:'disallowed'}])await assert.rejects(command(expectation(patch)));
await assert.rejects(command(expectation(),a,'method'),'RPC operation must match input operation');
const nonManifest=await snapshot(leftCase,left,'already visible but absent from baseline report');
await assert.rejects(command(expectation({baselineSnapshotId:nonManifest})),'baseline belongs to selected frozen report');
const predictionInput=expectation(),prediction=await command(predictionInput);assert.ok(prediction.id);assert.equal(new Date(prediction.createdAt).toISOString(),'2100-01-01T12:00:00.000Z');assert.equal(prediction.payload.baselineSnapshotId,baseline);
const oldFollow={operation:'followup',requestId:id(),caseId:leftCase,expectationId:prediction.id,snapshotId:baseline,outcome:'support',quote:'original public source',sameScopeConfirmed:true,scope:predictionInput.scope,note:'later check',accessStatus:'public',coverage:'complete'};
await assert.rejects(command(oldFollow),'existing baseline cannot reveal future outcome');await assert.rejects(command({...oldFollow,requestId:id(),snapshotId:otherBaseline}));
const fresh=await snapshot(leftCase,left,'Later exact quote shows same SKU remains','2100-01-01T13:00:00Z');
const futureSnapshot=await snapshot(leftCase,left,'future dated source','2100-01-09T12:00:00Z');
await clock('2100-01-01T14:00:00Z');
const follow=(patch={})=>({...oldFollow,requestId:id(),snapshotId:fresh,quote:'exact quote shows same SKU',...patch});
await assert.rejects(command(follow({quote:'invented quotation'})));
await assert.rejects(command(follow({snapshotId:futureSnapshot,quote:'future dated source'})),'future-dated evidence is unavailable');
const premature=await command(follow());assert.equal(premature.payload.outcome,'unknown','before deadline cannot conclude');
await clock('2100-01-03T12:00:00Z');assert.deepEqual(await command(predictionInput),prediction,'expectation replay survives expired deadline');
for(const patch of [{sameScopeConfirmed:false},{scope:'a different promotion period'},{coverage:'failed_fetch'},{coverage:'list_absence'},{coverage:'insufficient'},{accessStatus:'partial'},{accessStatus:'unavailable'},{accessStatus:'login_required'},{quote:''}])assert.equal((await command(follow(patch))).payload.outcome,'unknown',JSON.stringify(patch));
for(const patch of [{sameScopeConfirmed:'true'},{outcome:null},{coverage:null},{accessStatus:null},{quote:null}])await assert.rejects(command(follow(patch)));
const blockedSource=await snapshot(leftCase,left,'Known login only quote','2100-01-01T13:00:00Z',a,{structured:{accessStatus:'login_required'}});
assert.equal((await command(follow({snapshotId:blockedSource,quote:'Known login only quote'}))).payload.outcome,'unknown','snapshot access metadata overrides claimed public');
const changedItem=await snapshot(leftCase,left,'Other item quote','2100-01-01T13:00:00Z',a,{itemId:'fixture:other'});
assert.equal((await command(follow({snapshotId:changedItem,quote:'Other item quote'}))).payload.outcome,'unknown','known item mismatch cannot conclude');
for(const dateSeen of [undefined,null,'not a date','2100-02-30','2099-12-31','2100-01-01','2100-01-09']){
 const manualSource=await snapshot(leftCase,left,'Manual exact quote','2100-01-03T11:00:00Z',a,{origin:'manual_excerpt',structured:{dateSeen}});
 assert.equal((await command(follow({snapshotId:manualSource,quote:'Manual exact quote'}))).payload.outcome,'unknown',`manual seen ${dateSeen} cannot prove a later observation`);
}
for(const dateSeen of ['2100-01-02','2100-01-03']){
 const manualSource=await snapshot(leftCase,left,'New manual exact quote','2100-01-03T11:00:00Z',a,{origin:'manual_excerpt',structured:{dateSeen}});
 assert.equal((await command(follow({snapshotId:manualSource,quote:'New manual exact quote'}))).payload.outcome,'support','later manual seen date plus explicit same-scope confirmation');
}
const oldSeen=await snapshot(leftCase,left,'Public excerpt seen before prediction','2100-01-03T11:00:00Z',a,{structured:{dateSeen:'2099-12-31'}});
assert.equal((await command(follow({snapshotId:oldSeen,quote:'Public excerpt seen before prediction'}))).payload.outcome,'unknown','known old public excerpt cannot become later evidence through re-entry');
const followInput=follow(),verified=await command(followInput);assert.equal(verified.payload.outcome,'support');assert.deepEqual(await command(followInput),verified);
// Conditions and confirmation belong to the user; AI reports alone are absent from the method library.
assert.deepEqual((await search()).items,[]);for(const patch of [{confirmed:false},{confirmed:'true'},{conditions:''},{failureConditions:null},{reportId:foreignReport}])await assert.rejects(command(method(patch)));
const methodInput=method(),savedMethod=await command(methodInput);assert.equal((await search('Independent')).items[0].id,savedMethod.id);assert.deepEqual((await search('no such phrase')).items,[]);assert.deepEqual((await search('',b)).items,[]);
const lesson=await report('lesson',{caseId:leftCase,reportId,requestId:id(),method:'Confirmed B lesson',conditions:'resources available',unknowns:'demand untested'});
assert.ok((await search('Confirmed B lesson')).items.some(x=>x.id===lesson.id),'B user lesson is searchable');await assert.rejects(command(method({lessonId:id()})));
const frozenBefore=await scalar('select payload from business_case_revisions where id=$1',[reportId]);
const correction=await command({operation:'correction',requestId:id(),caseId:leftCase,snapshotId:baseline,explanation:'Publication date is unknown; viewing date is not publication date'});
assert.equal(correction.operation,'correction');assert.deepEqual(await scalar('select payload from business_case_revisions where id=$1',[reportId]),frozenBefore,'correction does not overwrite frozen report');
assert.ok(correction.payload.dependencies.includes('报告版本 1 · 热销依据'),'correction labels the explicitly referenced section');assert.ok(correction.payload.dependencies.every(label=>typeof label==='string'));assert.deepEqual(await scalar('select section_keys from business_learning_report_reviews where correction_id=$1 and report_id=$2',[correction.id,reportId]),['volume']);
assert.ok((await search('Independent')).items[0].reviewNeeded,'dependent method marked for review');
await command({operation:'correction',requestId:id(),caseId:leftCase,snapshotId:fresh,explanation:'Scope label corrected'});assert.ok((await read(leftCase)).items.find(x=>x.id===verified.id).reviewNeeded,'dependent followup marked for review');
// Cursor ordering uses its owned timestamp+id boundary; page size must not lose records.
for(let i=0;i<65;i++)await command(method({method:`Pagination method ${i}`}));
await clock('2100-01-04T12:00:00Z');
const newestMethod=await command(method({method:'Pagination method newest'}));
assert.equal((await search('Pagination method')).items[0].id,newestMethod.id,'timestamps precede UUID ordering');
const seen=new Set();let cursor=null,pages=0;do {const page=await search('Pagination method',a,cursor);assert.ok(page.items.length);for(const item of page.items){assert.ok(!seen.has(item.id),'cursor never repeats');seen.add(item.id);}cursor=page.nextCursor;assert.ok(++pages<10);}while(cursor);assert.equal(seen.size,66);
await assert.rejects(search('',b,savedMethod.id));await assert.rejects(read(leftCase,a,id()));
// Corrections and receipts remain append-only, with one narrow controlled source erase exception.
const learningTables=(await query(`select tablename from pg_tables where schemaname='public' and tablename like 'business_learning%'`)).map(x=>x.tablename);
assert.ok(learningTables.length>=1);for(const table of learningTables){if(await scalar(`select count(*)::int from ${table}`)){await assert.rejects(db.exec(`update ${table} set user_id=user_id`),undefined,`${table} immutable update`);await assert.rejects(db.exec(`delete from ${table}`),undefined,`${table} immutable delete`);}}
await assert.rejects(scalar('select business_erase_content($1,$2,$3,null)',[b,leftCase,fresh]));await scalar('select business_erase_content($1,$2,$3,null)',[a,leftCase,fresh]);
const erased=(await readAll(leftCase)).find(x=>x.id===verified.id);assert.equal(erased.payload.quote,'');assert.equal(erased.sourceInvalidated,true);assert.equal((await readAll(leftCase)).find(x=>x.id===prediction.id).payload.question,predictionInput.question);assert.equal((await search('Independent')).items[0].payload.method,methodInput.method);
assert.equal((await command(followInput)).payload.quote,'','replaying a receipt cannot recover erased quote');
await assert.rejects(command({...followInput,note:'changed after erasure'}),/conflict/);
for(const table of learningTables)assert.ok(!(await scalar(`select coalesce(string_agg(to_jsonb(x)::text,''),'') from ${table} x`)).includes('exact quote shows same SKU'),`${table} has no erased quote copies`);
const oldErase=await query(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'business_erase_content%' and p.proname<>'business_erase_content' and has_function_privilege('service_role',p.oid,'execute')`);assert.deepEqual(oldErase,[],'old erasure implementation cannot bypass D wrapper');
await assert.rejects(db.query("insert into business_learning_entries(user_id,case_id,operation,payload,report_id) values($1,$2,'method','{}',$3)",[a,leftCase,foreignReport]),e=>e.code==='23503');
await db.exec('set role service_role');
assert.equal((await command(followInput)).payload.quote,'','service role may replay through the guarded RPC');
await assert.rejects(db.exec("insert into business_learning_erasures(user_id,case_id,snapshot_id) values('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000006','40000000-0000-4000-8000-000000000009')"),e=>e.code==='42501');
await db.exec('reset role');
assert.equal(await scalar('select count(*)::int from observations'),0);assert.equal(await scalar('select count(*)::int from ideas'),0);assert.equal(await scalar('select count(*)::int from validations'),0);assert.equal(await scalar('select count(*)::int from idea_experiments'),0);
console.log('Business learning PostgreSQL: owner guards, identity graph/exclusion/revocation, immutable predictions, scoped quoted outcomes, correction, method pagination, erasure and 109 regression passed');
await db.close();






