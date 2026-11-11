import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Run: node supabase/tests/business_research.integration.mjs <absolute PGlite runtime path>
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const caseId = '33333333-3333-4333-8333-333333333333';
const case2 = '44444444-4444-4444-8444-444444444444';
const sourceId = '55555555-5555-4555-8555-555555555555';
const materialId = '66666666-6666-4666-8666-666666666666';
const jobId = '77777777-7777-4777-8777-777777777777';
const experienceId = '88888888-8888-4888-8888-888888888888';
let requests = 0;
const requestId = () => `99999999-9999-4999-8999-${String(++requests).padStart(12, '0')}`;
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$select null::uuid$$;
create function auth.role() returns text language sql as $$select coalesce(current_setting('request.jwt.claim.role',true),'service_role')$$;
create function public.business_service(p uuid) returns void language plpgsql as $$begin if auth.role()<>'service_role' or p is null or not exists(select 1 from auth.users where id=p) then raise exception 'business owner/service required' using errcode='42501';end if;end$$;
create table business_daily_cases(id uuid primary key,user_id uuid,created_at timestamptz default now());
create table business_material_snapshots(id uuid primary key,user_id uuid,captured_text text,source_url text,published_at timestamptz,captured_at timestamptz default now(),erased_at timestamptz);
create table business_case_members(user_id uuid,case_id uuid,snapshot_id uuid);
create table reality_materials(id uuid primary key,user_id uuid,sanitized_text text,status text,source_url text,created_at timestamptz default now());
create table job_postings(id uuid primary key,user_id uuid,body text,url text,created_at timestamptz default now());
create table career_entries(id uuid primary key,user_id uuid,confirmed_at timestamptz);
insert into auth.users values('${owner}'),('${other}');
insert into business_daily_cases values('${caseId}','${owner}',now()),('${case2}','${owner}',now());
insert into business_material_snapshots(id,user_id,captured_text,source_url) values('${sourceId}','${owner}','前缀😀 店铺停止营业。另一个消费者要求快捷配送。','https://example.test/source');
insert into business_case_members values('${owner}','${caseId}','${sourceId}');
insert into reality_materials(id,user_id,sanitized_text,status) values('${materialId}','${owner}','消费者要求低价，但另一侧要求快捷配送。','confirmed');
insert into job_postings(id,user_id,body) values('${jobId}','${owner}','每周负责访谈客户并整理交付流程。');
insert into career_entries values('${experienceId}','${owner}',now());
`);
await db.exec(await readFile(new URL('../migrations/124_business_research_suite.sql', import.meta.url), 'utf8'));
const command = async (operation, input, user = owner) => {
  try {
    return (await db.query('select business_research_command($1,$2,$3::jsonb) result', [user, operation, JSON.stringify(input)])).rows[0].result;
  } catch (error) {
    // PGlite errors carry the entire parameters array; keep test failures readable.
    throw new Error(error.message);
  }
};
const failure = () => ({ kind: 'failure', title: '用户待核对的退出整理', caseIds: [caseId], experienceIds: [], sources: [{ key: 's1', kind: 'snapshot', id: sourceId, quote: '店铺停止营业。', publicConfirmed: true }], payload: { event: 'stop', when: '', scope: 'store', disclosureKey: 's1', confirmedDisclosure: true, whatChanged: '停止营业', alternative: '也可能只是短期休整', condition: '查正式披露', checkNext: '联系店铺' }, expectedRevision: 0, requestId: requestId() });
const rejects = async (input, pattern = /invalid|unavailable|owner|revision|conflict|required|source|payload|quote|experience|kind/i) => assert.rejects(command('save', input), pattern);
const original = failure();
const saved = await command('save', original);
assert.equal(saved.revision, 1);
assert.deepEqual(await command('save', original), saved);
await rejects({ ...original, title: '改变相同请求' }, /conflict/i);
assert.equal((await command('list', {})).items.length, 1);
assert.equal(await command('get', { id: saved.id }, other), null);
await rejects({ ...failure(), sources: [{ ...original.sources[0], quote: '不存在的原文' }] });
await rejects({ ...failure(), sources: [{ ...original.sources[0], publicConfirmed: false }] });
await rejects({ ...failure(), caseIds: ['bad'] });
await rejects({ ...failure(), experienceIds: [experienceId] });
await rejects({ ...failure(), payload: { ...original.payload, injected: 'unknown' } });
await rejects({ ...failure(), payload: { ...original.payload, confirmedDisclosure: false } });
await rejects({ ...failure(), payload: { ...original.payload, whatChanged: null } });
for (const malformed of [
  { ...failure(), unexpected: 'field' },
  { ...failure(), title: ' ' },
  { ...failure(), title: 'x'.repeat(3001) },
  { ...failure(), expectedRevision: 1.1 },
  { ...failure(), expectedRevision: -1 },
  { ...failure(), expectedRevision: '0' },
  { ...failure(), sources: null },
  { ...failure(), sources: [original.sources[0], original.sources[0]] },
  { ...failure(), sources: [{ ...original.sources[0], key: '<bad>' }] },
  { ...failure(), sources: [{ ...original.sources[0], quote: '短' }] },
  { ...failure(), sources: [{ ...original.sources[0], quote: 'x'.repeat(1601) }] },
  { ...failure(), payload: { ...original.payload, alternative: ' ' } },
  { ...failure(), payload: { ...original.payload, event: 'maybe' } },
  { ...failure(), payload: { ...original.payload, scope: 'everything' } },
  { ...failure(), payload: { ...original.payload, disclosureKey: 'missing' } },
]) await rejects(malformed);
await assert.rejects(command('save', failure(), other), /owner|unavailable/i);
await assert.rejects(command('erase', { id: saved.id, requestId: requestId() }, other), /owner|unavailable/i);
await db.query('insert into reality_materials(id,user_id,sanitized_text,status) values($1,$2,$3,$4)', ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', other, '仅他人拥有的材料原文', 'confirmed']);
await rejects({ ...failure(), sources: [{ ...original.sources[0], kind: 'material', id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', quote: '仅他人拥有的材料原文' }] });
await rejects({ ...failure(), caseIds: [case2] }); // Owned snapshot, but not a member of the selected case.
await rejects({ ...failure(), sources: [{ ...original.sources[0], kind: 'job', id: jobId, quote: '每周负责访谈客户' }] });
const live = await command('get', { id: saved.id });
assert.equal(live.sources[0].quote, original.sources[0].quote);
assert.equal(live.sources[0].url, 'https://example.test/source');
assert.equal(live.invalidated, false);
const rawRef = (await db.query('select * from business_research_refs')).rows[0];
assert.equal(rawRef.quote_start, 5); // PostgreSQL counts Unicode characters, including one emoji.
assert.ok(!JSON.stringify(rawRef).includes(original.sources[0].quote));
const receipt = (await db.query('select * from business_research_receipts')).rows[0];
assert.match(receipt.input_hash, /^[0-9a-f]{64}$/);
assert.deepEqual(Object.keys(receipt.result).sort(), ['id', 'revision']);
assert.ok(!JSON.stringify(receipt).includes(original.sources[0].quote));
const changed = { ...original, id: saved.id, requestId: requestId(), expectedRevision: 1, title: '修改后' };
assert.equal((await command('save', changed)).revision, 2);
assert.equal((await command('get', { id: saved.id })).createdAt, live.createdAt);
await rejects({ ...changed, requestId: requestId() }, /revision/i);
const racing = await Promise.allSettled([command('save', { ...changed, expectedRevision: 2, requestId: requestId() }), command('save', { ...changed, expectedRevision: 2, requestId: requestId() })]);
assert.equal(racing.filter(x => x.status === 'fulfilled').length, 1);
const comparison = { ...failure(), kind: 'comparison', caseIds: [caseId, case2], payload: { dimensions: ['buyer','user','payer','trigger','delivery','alternative'].map(key => ({ key, left: '待核对', right: '待核对', leftSourceKey: null, rightSourceKey: null })), hypothesis: '待核对假设', counterexample: '反例', checkNext: '核对' } };
await command('save', comparison);
await rejects({ ...comparison, requestId: requestId(), caseIds: [caseId, caseId] });
await rejects({ ...comparison, requestId: requestId(), payload: { ...comparison.payload, dimensions: comparison.payload.dimensions.slice(1) } });
await rejects({ ...comparison, requestId: requestId(), payload: { ...comparison.payload, dimensions: comparison.payload.dimensions.map(d => ({ ...d, key: 'buyer' })) } });
await rejects({ ...comparison, requestId: requestId(), payload: { ...comparison.payload, dimensions: comparison.payload.dimensions.map(d => ({ ...d, leftSourceKey: 'missing' })) } });
await command('save', { ...comparison, requestId: requestId(), sources: [] });
const chineseComparison = { ...comparison, requestId: requestId(), sources: [], payload: { ...comparison.payload, dimensions: comparison.payload.dimensions.map(d => ({ ...d, left: '中'.repeat(3000), right: '文'.repeat(3000) })) } };
assert.ok(Buffer.byteLength(JSON.stringify(chineseComparison), 'utf8') > 100000);
const largeSaved = await command('save', chineseComparison);
assert.equal((await command('get', { id: largeSaved.id })).payload.dimensions[0].left, '中'.repeat(3000));
await rejects({ ...comparison, requestId: requestId(), oversized: '中'.repeat(90000) }, /invalid research input/i);
const tension = { ...failure(), kind: 'tension', sources: [...original.sources, { key: 's2', kind: 'material', id: materialId, quote: '消费者要求低价', publicConfirmed: true }], payload: { task: '配送', leftNeed: '快捷', rightNeed: '低价', leftSourceKey: 's1', rightSourceKey: 's2', tradeoff: '成本', alternative: '自取', checkNext: '接触用户' } };
await command('save', tension);
await rejects({ ...tension, requestId: requestId(), payload: { ...tension.payload, rightSourceKey: 's1' } });
const apprenticeship = { ...failure(), kind: 'apprenticeship', experienceIds: [experienceId], sources: [{ key: 'j1', kind: 'job', id: jobId, quote: '每周负责访谈客户', publicConfirmed: true }], payload: { mechanism: '访谈', timeBudget: '每周两小时', cashBudget: '零', constraintsConfirmed: true, gap: '交付', practice: '做访谈', checkNext: '问雇主', jobLink: { jobId, sourceKey: 'j1', rationale: '岗位明确提到访谈', employerQuestion: '如何开展访谈' } } };
const apprenticeSaved = await command('save', apprenticeship);
const renamedJobId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const renamedJobAfterId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
await db.query('insert into job_postings(id,user_id,body) values($1,$2,$3)', [renamedJobId, owner, '每周负责访谈客户并整理交付流程。']);
const renamedJobRecord = await command('save', { ...apprenticeship, requestId: requestId(), experienceIds: [], sources: [{ ...apprenticeship.sources[0], id: renamedJobId }], payload: { ...apprenticeship.payload, jobLink: { ...apprenticeship.payload.jobLink, jobId: renamedJobId } } });
await db.query('update job_postings set id=$1 where id=$2', [renamedJobAfterId, renamedJobId]);
await db.query('delete from job_postings where id=$1', [renamedJobAfterId]);
const afterJobRename = (await db.query('select title,payload from business_research_records where id=$1', [renamedJobRecord.id])).rows[0];
assert.deepEqual(afterJobRename, { title: '', payload: null });
assert.equal((await db.query('select count(*)::int n from business_research_refs where record_id=$1', [renamedJobRecord.id])).rows[0].n, 0);
await rejects({ ...apprenticeship, requestId: requestId(), payload: { ...apprenticeship.payload, jobLink: { ...apprenticeship.payload.jobLink, jobId: sourceId } } });
await rejects({ ...apprenticeship, requestId: requestId(), payload: { ...apprenticeship.payload, constraintsConfirmed: false } });
await command('save', { ...apprenticeship, requestId: requestId(), sources: [], payload: { ...apprenticeship.payload, jobLink: null } });
const materialOnly = () => ({ ...failure(), sources: [{ key: 's1', kind: 'material', id: materialId, quote: '消费者要求低价', publicConfirmed: true }] });
const renamedMaterialId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const renamedMaterialAfterId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
await db.query('insert into reality_materials(id,user_id,sanitized_text,status) values($1,$2,$3,$4)', [renamedMaterialId, owner, '消费者要求低价', 'confirmed']);
const renamedMaterialRecord = await command('save', { ...materialOnly(), sources: [{ ...materialOnly().sources[0], id: renamedMaterialId }], requestId: requestId() });
await db.query('update reality_materials set id=$1 where id=$2', [renamedMaterialAfterId, renamedMaterialId]);
await db.query('delete from reality_materials where id=$1', [renamedMaterialAfterId]);
const afterMaterialRename = (await db.query('select title,payload from business_research_records where id=$1', [renamedMaterialRecord.id])).rows[0];
assert.deepEqual(afterMaterialRename, { title: '', payload: null });
assert.equal((await db.query('select count(*)::int n from business_research_refs where record_id=$1', [renamedMaterialRecord.id])).rows[0].n, 0);
const materialSaved = await command('save', materialOnly());
await db.query('update reality_materials set sanitized_text=null where id=$1', [materialId]);
assert.equal((await db.query('select payload from business_research_records where id=$1', [materialSaved.id])).rows[0].payload, null);
assert.equal((await db.query('select count(*)::int n from business_research_refs where record_id=$1', [materialSaved.id])).rows[0].n, 0);
await db.query('update reality_materials set sanitized_text=$1 where id=$2', ['消费者要求低价，但另一侧要求快捷配送。', materialId]);
const deletedMaterial = await command('save', materialOnly());
await db.query("update reality_materials set status='deleted' where id=$1", [materialId]);
assert.equal((await db.query('select title from business_research_records where id=$1', [deletedMaterial.id])).rows[0].title, '');
await rejects(materialOnly());
await db.query('update career_entries set confirmed_at=null where id=$1', [experienceId]);
const revoked = await command('get', { id: apprenticeSaved.id });
assert.equal(revoked.experienceInvalidated, true);
assert.equal(revoked.payload, null);
await rejects({ ...apprenticeship, requestId: requestId() });
await db.query('update business_material_snapshots set captured_text=captured_text||$1 where id=$2', ['新增事实', sourceId]);
const invalid = await command('get', { id: saved.id });
assert.equal(invalid.invalidated, true);
assert.equal(invalid.payload, null);
assert.equal(invalid.title, '');
assert.equal(invalid.sources[0].quote, '');
assert.ok((await db.query('select payload from business_research_records where id=$1', [saved.id])).rows[0].payload.whatChanged);
await db.query('update business_material_snapshots set captured_text=null,erased_at=now() where id=$1', [sourceId]);
assert.equal((await db.query('select title from business_research_records where id=$1', [saved.id])).rows[0].title, '');
assert.equal((await db.query('select count(*)::int n from business_research_refs where record_id=$1', [saved.id])).rows[0].n, 0);
await db.query('delete from job_postings where id=$1', [jobId]);
assert.equal((await command('get', { id: apprenticeSaved.id })).payload, null);
assert.equal((await db.query('select payload from business_research_records where id=$1', [apprenticeSaved.id])).rows[0].payload, null);
const erased = await command('erase', { id: saved.id, requestId: requestId() });
assert.deepEqual(Object.keys(erased).sort(), ['id', 'revision']);
const page1 = await command('list', {});
assert.equal(page1.available, true);
for (let i=0;i<32;i++) await command('save', { ...comparison, requestId: requestId(), sources: [] });
const page2 = await command('list', { kind: 'comparison' });
assert.equal(page2.items.length, 30);
assert.ok(page2.nextCursor);
const page3 = await command('list', { kind: 'comparison', before: page2.nextCursor });
assert.ok(page3.items.length>0);
assert.ok(page3.items.every(row => !page2.items.some(previous => row.id===previous.id)));
assert.equal(page3.nextCursor, null);
await db.exec('set role service_role');
await assert.rejects(db.query('select * from business_research_records'), /permission denied/i);
await assert.rejects(db.query('select * from business_research_receipts'), /permission denied/i);
await assert.rejects(db.query('select business_research_source($1,$2,$3,$4::jsonb)', [owner, 'snapshot', sourceId, JSON.stringify([caseId])]), /permission denied/i);
assert.equal((await command('list', {})).available, true);
await db.exec('reset role');
await db.exec("set request.jwt.claim.role='authenticated'");
await assert.rejects(command('list', {}), /service/i);
await db.close();
console.log('business research SQL integration: passed');
