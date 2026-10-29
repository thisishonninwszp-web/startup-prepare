import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;create table companies(id uuid primary key,user_id uuid,name text);create table ideas(id uuid primary key,user_id uuid,title text,status text,last_activity_at timestamptz);create table validations(id uuid);create table job_postings(id uuid primary key,user_id uuid,company_id uuid,company_name text,title text,body text,url text,found_on date,facts jsonb);`);
await db.exec(await readFile(new URL('../../../../supabase/migrations/110_company_observations.sql',import.meta.url),'utf8'));
const id=n=>`aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12,'0')}`;const user=id(1),other=id(2),co=id(3),co2=id(4),foreign=id(5),idea=id(6),otherIdea=id(7);
await db.query('insert into auth.users values($1),($2)',[user,other]);await db.query("insert into companies values($1,$2,'A'),($3,$2,'B'),($4,$5,'C')",[co,user,co2,foreign,other]);await db.query("insert into ideas values($1,$2,'idea','验证中','2020-01-01'),($3,$4,'other','观察','2020-01-01')",[idea,user,otherIdea,other]);await db.exec("set request.jwt.claim.role='service_role'");
const scalar=async(sql,args=[])=>(await db.query(sql,args)).rows[0].result;
const source={kind:'manual_import',url:'https://example.com',rawText:'original quote',quote:'quote',scope:'one record'};const identity={corporateNumber:'1234567890123',legalName:'Name',address:'Tokyo',source};
const proof=async(jobId)=>scalar('select company_job_preview_hash(j) as result from job_postings j where id=$1',[jobId]);
const write=(request,kind,payload,company=co,who=user,expected=null)=>scalar('select save_company_observation($1,$2,$3,$4,$5,$6) as result',[who,company,request,kind,payload,expected]);
const a=await write(id(10),'identity',{action:'confirm',identity});assert.deepEqual(await write(id(10),'identity',{action:'confirm',identity}),a);
await assert.rejects(write(id(10),'identity',{action:'clear'}),/conflict/);await assert.rejects(write(id(11),'identity',{action:'confirm',identity}),/stale/);await assert.rejects(write(id(12),'identity',{action:'confirm',identity},co2),/already bound/);await assert.rejects(write(id(13),'identity',{action:'confirm',identity},foreign),/unavailable/);
const activity={type:'procurement',stage:'announcement',title:'Notice',occurredOn:null,dateUnknown:true,source,details:{amount:0,currency:'JPY'}};const entry=await write(id(20),'activity',activity);await assert.rejects(write(id(21),'activity',{...activity,source:{...source,quote:'fake'}}),/quote/);await assert.rejects(write(id(22),'activity',{...activity,source:{...source,kind:'provider_verified'}}),/source/);
await assert.rejects(write(id(23),'review',{sourceEntryId:entry.id,ideaId:otherIdea,assumption:'x',unknown:'y'}),/idea unavailable/);await assert.rejects(write(id(24),'review',{sourceEntryId:entry.id,ideaId:idea,assumption:'x',unknown:'y'},co2),/entry unavailable/);await write(id(25),'review',{sourceEntryId:entry.id,ideaId:idea,assumption:'x',unknown:'y'});
await assert.rejects(write(id(26),'activity',{...activity,source:{...source,kind:'official_response'},details:{corporateNumber:identity.corporateNumber,identityEntryId:id(999)}}),/identity changed/);
await assert.rejects(write(id(27),'activity',{...activity,details:{corporateNumber:identity.corporateNumber,identityEntryId:id(999)}}),/identity changed/);
await write(id(28),'activity',{...activity,details:{corporateNumber:identity.corporateNumber,identityEntryId:a.id}});
await db.exec('alter table company_observation_entries disable trigger company_observation_immutable');await db.query("update company_observation_entries set created_at='2100-01-01' where id=$1",[a.id]);await db.exec('alter table company_observation_entries enable trigger company_observation_immutable');
await assert.rejects(write(id(29),'activity',{...activity,source:{...source,requestProof:'wrong'}}),/request proof/);
await write(id(129),'activity',{...activity,source:{...source,requestProof:'a'.repeat(64)}});
await assert.rejects(write(id(130),'activity',{...activity,source:{...source,url:'https://user:secret@example.com/doc'}}),/source/);
const clear=await write(id(30),'identity',{action:'clear'},co,user,a.id);assert.ok(clear.id);const current2=await write(id(31),'identity',{action:'confirm',identity},co2);
const races=await Promise.allSettled([write(id(32),'identity',{action:'confirm',identity:{...identity,legalName:'Updated A'}},co2,user,current2.id),write(id(33),'identity',{action:'confirm',identity:{...identity,legalName:'Updated B'}},co2,user,current2.id)]);assert.equal(races.filter(r=>r.status==='fulfilled').length,1);assert.equal(races.filter(r=>r.status==='rejected').length,1);
await db.query("insert into job_postings values($1,$2,null,'Name','job','exact server body','https://example.com/job','2026-01-01','{}')",[id(40),user]);await assert.rejects(write(id(41),'job',{jobId:id(40),confirmCandidate:false}),/confirm/);const job=await write(id(42),'job',{jobId:id(40),confirmCandidate:true,previewHash:await proof(id(40))});await db.query('delete from job_postings where id=$1',[id(40)]);assert.equal((await scalar('select payload as result from company_observation_entries where id=$1',[job.id])).source.rawText,'exact server body');
const largeBody='原'.repeat(120000);await db.query("insert into job_postings values($1,$2,$3,'Name','large',$4,null,'2026-01-01','{}')",[id(43),user,co,largeBody]);await assert.rejects(write(id(144),'job',{jobId:id(43),confirmCandidate:false,previewHash:'a'.repeat(64)}),/job changed/);const expectedPreviewHash=createHash('sha256').update([id(43),co,'Name','large',largeBody,null,'2026-01-01'].map(value=>value===null?'-1:':String(Buffer.byteLength(value,'utf8'))+':'+value).join('')).digest('hex');assert.equal(await proof(id(43)),expectedPreviewHash);const largeJob=await write(id(44),'job',{jobId:id(43),confirmCandidate:false,previewHash:await proof(id(43))});const largeStored=await scalar('select payload as result from company_observation_entries where id=$1',[largeJob.id]);assert.equal(largeStored.source.rawText.length,100000);assert.equal(largeStored.source.quote.length,20000);assert.equal(largeStored.details.jobSnapshot.body,undefined);assert.equal(largeStored.details.originalBodyHash,createHash('sha256').update(largeBody).digest('hex'));assert.equal(largeStored.details.capturedBodyHash,createHash('sha256').update(largeBody.slice(0,100000)).digest('hex'));assert.match(largeStored.source.scope,/100000 of 120000/);assert.match(largeStored.source.scope,/clipped/);
const revisions=(await db.query('select revision from company_observation_entries where company_id=$1 order by revision',[co])).rows.map(r=>r.revision);assert.deepEqual(revisions,Array.from({length:revisions.length},(_,i)=>i+1));
await assert.rejects(db.query("update company_observation_entries set payload='{}' where id=$1",[entry.id]),/immutable/);await assert.rejects(db.query('delete from company_observation_entries where id=$1',[entry.id]),/immutable/);
assert.equal(await scalar('select count(*)::int as result from validations'),0);assert.equal(await scalar('select status as result from ideas where id=$1',[idea]),'验证中');assert.equal((await scalar('select last_activity_at::text as result from ideas where id=$1',[idea])).slice(0,10),'2020-01-01');
await db.exec("set request.jwt.claim.role='authenticated'");await assert.rejects(write(id(50),'activity',activity),/service/);await db.exec("set request.jwt.claim.role='service_role'");await assert.rejects(write(id(51),'activity',activity,co,null),/owner/);
await db.exec('grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;');
await db.exec(`set role authenticated;set request.jwt.claim.sub='${other}';`);assert.equal(await scalar('select count(*)::int as result from company_observation_entries'),0);await assert.rejects(write(id(52),'activity',activity),/permission denied/);await db.exec('reset role');
console.log('company PostgreSQL integration passed');await db.close();










