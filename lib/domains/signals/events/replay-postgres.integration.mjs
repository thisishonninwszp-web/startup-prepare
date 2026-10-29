// Isolated PostgreSQL replay boundary tests; no network or persistent database.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
grant usage on schema auth to authenticated,anon,service_role;
create table public.external_signals(id uuid primary key,title text,source text,url text,fetched_at timestamptz);
create table public.signal_opens(user_id uuid,signal_id uuid,first_at timestamptz);`);
for (const file of ['105_signal_event_dossiers.sql','107_signal_event_replay.sql']) await db.exec(await readFile(new URL('../../../../supabase/migrations/'+file,import.meta.url),'utf8'));
const id=n=>`aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12,'0')}`;
const user=id(1),other=id(2),cutoff='2026-01-01T00:00:00Z';
const scalar=async(sql,args=[]) => (await db.query(sql,args)).rows[0].result;
await db.exec("set request.jwt.claim.role='service_role'");
await db.query('insert into auth.users values($1),($2)',[user,other]);
const event=(await scalar('select public.create_signal_event($1,$2,null,$3) result',[user,'LATEST EVENT SECRET',id(3)])).id;
// Fixture-only historical clock override. Production snapshot clock is immutable.
await db.exec('alter table public.signal_source_snapshots disable trigger source_snapshot_immutable');
for (const [n,title,published,captured] of [[10,'KNOWN',cutoff,cutoff],[11,'FUTURE-SECRET','2026-01-02','2026-01-02'],[12,'LATE-SAVED-OLD','2025-12-01','2026-01-03'],[13,'PREVIOUSLY-KNOWN','2025-12-01','2025-12-01']]) {
 await db.query('insert into public.external_signals values($1,$2,\'news\',null,now())',[id(n),title]);
 await db.query(`insert into public.signal_source_snapshots(id,user_id,signal_id,title,source_name,source_url,captured_text,capture_scope,payload_hash,published_at,captured_at)
 values($1,$2,$3,$4,'news',$5,$4,'excerpt',$6,$7,$8)`,[id(n+100),user,id(n),title,'https://example.org/'+title,String(n).padStart(64,'0'),published,captured]);
 await scalar('select public.revise_signal_event_member($1,$2,$3,$4,\'include\',$5) result',[user,event,id(n),id(n+100),id(n+200)]);
}
// Keep historical revisions real, but fixture their wall-clock dates.
await db.exec('alter table public.signal_event_memberships disable trigger membership_immutable');
await db.query(`update public.signal_event_memberships set created_at=case when signal_id=$1 then '2026-01-02'::timestamptz else '2025-12-01'::timestamptz end`,[id(11)]);
await scalar('select public.revise_signal_event_member($1,$2,$3,null,\'exclude\',$4) result',[user,event,id(13),id(300)]);
await db.query("update public.signal_event_memberships set created_at='2026-01-04' where action='exclude'");
await db.exec('alter table public.signal_event_memberships enable trigger membership_immutable;alter table public.signal_source_snapshots enable trigger source_snapshot_immutable');
const create=(mode,req=id(400),owner=user)=>scalar('select public.create_signal_event_replay($1,$2,$3,$4,$5) result',[owner,event,cutoff,mode,req]);
const session=(await create('archived')).id;
assert.equal((await create('archived')).id,session);
await assert.rejects(create('recovered'),/payload conflict/);
await assert.rejects(create('archived',id(401),other),/event unavailable/);
const read=(s=session,owner=user,e=event)=>scalar('select public.read_signal_event_replay($1,$2,$3) result',[owner,e,s]);
const initial=await read();
assert.deepEqual(initial.materials.map(m=>m.title).sort(),['KNOWN','PREVIOUSLY-KNOWN']);
assert.ok(!JSON.stringify(initial).includes('LATEST EVENT SECRET'));
assert.ok(!JSON.stringify(initial).includes('FUTURE-SECRET'));
assert.ok(!JSON.stringify(initial).includes('LATE-SAVED-OLD'));
assert.ok(!('total' in initial));
await assert.rejects(read(session,other),/replay unavailable/);
await assert.rejects(read(session,user,id(999)),/replay unavailable/);
const advance=(req=id(500),owner=user)=>scalar('select public.advance_signal_event_replay($1,$2,$3,$4) result',[owner,event,session,req]);
await assert.rejects(advance(),/practice guess first/);
const guess=(value='My practice guess',req=id(501))=>scalar('select public.guess_signal_event_replay($1,$2,$3,$4,$5) result',[user,event,session,value,req]);
await guess(); await guess(); await assert.rejects(guess('Changed'),/immutable/);
await assert.rejects(db.query("update public.signal_event_replays set guess='Rewritten' where id=$1",[session]),/immutable/);
const step=await advance();assert.equal(step.revealed,1);assert.ok(JSON.stringify(step).includes('FUTURE-SECRET'));assert.ok(!JSON.stringify(step).includes('LATE-SAVED-OLD'));
assert.equal((await advance()).revealed,1,'same request advances once');
await assert.rejects(advance(id(502),other),/replay unavailable/);
assert.equal((await advance(id(502))).revealed,2);
const recovered=(await create('recovered',id(600))).id;
const recoveredView=await read(recovered);
assert.ok(recoveredView.materials.some(m=>m.title==='LATE-SAVED-OLD' && m.retrospective));
assert.ok(!recoveredView.materials.some(m=>m.title==='PREVIOUSLY-KNOWN'),'recovered openly uses current set');
assert.ok(!JSON.stringify(recoveredView).includes('FUTURE-SECRET'));
// Freeze excludes later source changes and curation.
await db.query("update public.signal_events set title='CHANGED LATEST TITLE' where id=$1",[event]);
assert.deepEqual((await read(recovered)).materials,recoveredView.materials);
await db.exec("set request.jwt.claim.role='authenticated';set role authenticated");
await assert.rejects(db.query('select * from public.signal_event_replay_packets'),/permission denied/);
await assert.rejects(db.query('select * from public.signal_event_replays'),/permission denied/);
await assert.rejects(db.query('update public.signal_event_replays set revealed=999'),/permission denied/);
await assert.rejects(db.query('select public.read_signal_event_replay($1,$2,$3)',[user,event,session]),/permission denied/);
await db.exec('reset role');await db.close();console.log('Replay PostgreSQL integration checks passed.');
