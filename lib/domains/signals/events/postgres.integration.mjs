// Run against an isolated PGlite PostgreSQL instance only; never opens a network database.
// node lib/domains/signals/events/postgres.integration.mjs <absolute @electric-sql/pglite/dist/index.js>
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
process.on("uncaughtException", (error) => { console.error(error.message, error.code ?? "", error.stack?.split("\n").slice(-3).join("\n")); process.exit(1); });
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
  grant usage on schema auth to authenticated,anon,service_role;
  create table public.external_signals(id uuid primary key, title text, source text, url text, fetched_at timestamptz);
  create table public.signal_opens(user_id uuid, signal_id uuid, first_at timestamptz);
`);
await db.exec(await readFile(new URL("../../../../supabase/migrations/105_signal_event_dossiers.sql", import.meta.url), "utf8"));
const user = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const request = "33333333-3333-4333-8333-333333333333";
const uuid = (n) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;
await db.query("insert into auth.users values ($1),($2)", [user, other]);
await db.exec("set request.jwt.claim.role='service_role'");
const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0].result;
const create = (title, req = request, owner = user) => scalar("select public.create_signal_event($1,$2,null,$3) as result", [owner, title, req]);
const event = await create("Test news");
assert.deepEqual(await create("Test news"), event);
await assert.rejects(create("Changed"), /payload conflict/);
await assert.rejects(create("x".repeat(121), uuid(100)), /invalid event input/);
await db.exec("set request.jwt.claim.role='authenticated'");
await assert.rejects(create("Other user", uuid(101)), /event owner required/);
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
await assert.rejects(scalar("select public.signal_event_timeline($1,$2) as result", [user, event.id]), /event owner required/);
await db.exec("set request.jwt.claim.role='service_role'");

const snapshots = [];
for (let n = 1; n <= 6; n++) {
  await db.query("insert into public.external_signals values($1,$2,'news',null,now())", [uuid(n), `Test news ${n}`]);
  const rows = await db.query(`insert into public.signal_source_snapshots(user_id,signal_id,title,source_name,captured_text,capture_scope,payload_hash,published_at,captured_at)
    values($1,$2,$3,'news','Announced in February.','excerpt',$4,$5,'2000-01-01') returning id,captured_at`, [user, uuid(n), `Test news ${n}`, String(n).repeat(64), n <= 3 ? "2026-10-01" : null]);
  snapshots.push(rows.rows[0]);
  assert.ok(new Date(rows.rows[0].captured_at).getFullYear() > 2000, "capture time is DB enforced");
}
const revise = (signal, snapshot, action, req, occurrence = null) => scalar(
  "select public.revise_signal_event_member($1,$2,$3,$4,$5,$6,null,$7,$8,$9,$10) as result",
  [user, event.id, signal, snapshot, action, req, occurrence?.from ?? null, occurrence?.to ?? null, occurrence?.precision ?? null, occurrence?.quote ?? null]);
const first = await revise(uuid(1), snapshots[0].id, "include", uuid(11));
assert.deepEqual(await revise(uuid(1), snapshots[0].id, "include", uuid(11)), first);
await assert.rejects(revise(uuid(2), snapshots[1].id, "include", uuid(11)), /payload conflict/);
await assert.rejects(revise(uuid(2), snapshots[0].id, "include", uuid(12)), /snapshot unavailable/);
await assert.rejects(revise(uuid(2), snapshots[1].id, "include", uuid(12), { from: "2026-02-30", precision: "day", quote: "February" }), /date|range/);
await assert.rejects(revise(uuid(2), snapshots[1].id, "include", uuid(12), { from: "2026-02", precision: "month", quote: "fiction" }), /quote absent/);
await assert.rejects(revise(uuid(2), snapshots[1].id, "include", uuid(12), { from: "2026-02", to: "2026-01", precision: "month", quote: "February" }), /reversed/);
for (let n = 2; n <= 5; n++) await revise(uuid(n), snapshots[n - 1].id, "include", uuid(n + 10), n === 2 ? { from: "2026-02", to: null, precision: "month", quote: "February" } : null);
await revise(uuid(1), null, "exclude", uuid(21));
const page = (mode, cursor = null) => scalar("select public.signal_event_timeline($1,$2,$3,$4,2) as result", [user, event.id, mode, cursor]);
let published = await page("published");
assert.equal(published.items.length, 2);
assert.ok(published.items.every((r) => r.publishedAt !== null));
assert.ok(published.items.every((r) => r.signalId !== uuid(1)), "excluded member never resurrects");
const seen = new Set(published.items.map((r) => r.snapshotId));
published = await page("published", published.nextCursor);
assert.equal(published.items.length, 2);
assert.ok(published.items.every((r) => r.publishedAt === null));
assert.ok(published.items.every((r) => !seen.has(r.snapshotId)), "tie and missing-date pagination has no duplicates");
assert.equal(published.nextCursor, null);
await assert.rejects(page("captured", (await page("published")).nextCursor), /mode mismatch/);
await db.query("insert into public.signal_opens select $1::uuid,$2::uuid,'2026-01-01'::timestamptz + n*interval '1 day' from generate_series(0,1005) n", [user, uuid(2)]);
await db.query("insert into public.signal_opens values($1,$2,'1990-01-01')", [other, uuid(2)]);
const occurrence = (await page("occurred")).items[0];
assert.deepEqual(occurrence.occurred, { from: "2026-02", to: null, precision: "month", quote: "February" });
assert.ok(occurrence.firstRecordedOpenAt.startsWith("2026-01-01"), "minimum open includes all rows and viewer only");
const candidates = await scalar("select public.suggest_signal_event_members($1,$2) as result", [user, event.id]);
assert.deepEqual(candidates.map((r) => r.id), [uuid(6)], "explicit exclusions stay out of candidates");
await revise(uuid(6), null, "exclude", uuid(26));
assert.deepEqual(await scalar("select public.suggest_signal_event_members($1,$2) as result", [user, event.id]), [], "rejecting a candidate is persistent without an earlier inclusion");
await revise(uuid(6), snapshots[5].id, "include", uuid(36));
assert.equal((await scalar("select public.signal_event_timeline($1,$2,'captured',null,100) as result", [user, event.id])).items.length, 5, "explicit later inclusion remains possible");
const chinese = await create("日银加息", uuid(110));
await db.query("insert into public.external_signals values($1,'日银宣布再次加息','news',null,now())", [uuid(111)]);
assert.deepEqual((await scalar("select public.suggest_signal_event_members($1,$2) as result", [user, chinese.id])).map((r) => r.id), [uuid(111)], "CJK candidate retrieval does not require spaces or exact full title");
await assert.rejects(db.query("update public.signal_source_snapshots set title='Changed' where id=$1", [snapshots[0].id]), /immutable/);
await assert.rejects(db.query("delete from public.signal_source_snapshots where id=$1", [snapshots[5].id]), /immutable/);
await assert.rejects(db.query("delete from public.signal_event_memberships where event_id=$1", [event.id]), /append only/);
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
await db.exec("set role authenticated");
assert.equal((await db.query("select * from public.signal_events")).rows.length, 0, "RLS hides another reader's dossiers");
assert.equal((await db.query("select * from public.signal_source_snapshots")).rows.length, 0);
await assert.rejects(db.query("delete from public.signal_source_snapshots"), /permission denied/);
await assert.rejects(db.query("insert into public.signal_event_memberships default values"), /permission denied/);
await db.exec("reset role");
await db.query("delete from public.signal_events where id=$1", [event.id]);
assert.equal((await db.query("select * from public.signal_event_memberships")).rows.length, 0, "legitimate event cascade works");
await db.query("delete from auth.users where id=$1", [user]);
assert.equal((await db.query("select * from public.signal_source_snapshots")).rows.length, 0, "legitimate account cascade works");
await db.close();
console.log("Event dossiers: PostgreSQL integration checks passed.");
