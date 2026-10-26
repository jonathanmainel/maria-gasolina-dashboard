import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRecoveryPlan, DOMAINS, executeRecoveryPlan, planHash, RecoveryStopped } from './google-ads-recovery.mjs';

const input = () => ({ project_ref: 'abcdefghijklmnopqrst', client_slug: 'synthetic-client', account_ids: ['1234567890'], as_of_date: '2026-10-26', coverage: DOMAINS.map((domain) => ({ domain, account_id: '1234567890', last_date: '2026-09-27' })) });
const config = { projectUrl: 'https://abcdefghijklmnopqrst.supabase.co', secretKey: 'sb_secret_SYNTHETIC_ONLY' };
function result(body, extra = {}, status = 200) {
  return Response.json({ ok: true, recovery_contract_version: 1, mode: body.dry_run ? 'dry_run' : 'write', request: body,
    google_ads_configuration: { account_ids: ['1234567890'] },
    database_write_performed: !body.dry_run, database_write_status: body.dry_run ? null : 'success',
    counts: Object.fromEntries(DOMAINS.map((domain) => [domain, 1])), ...extra }, { status });
}

test('plan covers every missing complete day once and separates partial today', () => {
  const plan = buildRecoveryPlan(input());
  assert.deepEqual(plan.ranges, [
    { start_date: '2026-09-28', end_date: '2026-10-04' }, { start_date: '2026-10-05', end_date: '2026-10-11' },
    { start_date: '2026-10-12', end_date: '2026-10-18' }, { start_date: '2026-10-19', end_date: '2026-10-25' },
  ]);
  assert.equal(plan.partial_today.dry_run_only, true);
  assert.equal(plan.partial_today.start_date, '2026-10-26');
  assert.equal(planHash(plan), planHash(structuredClone(plan)));
});
test('different domain coverage starts at earliest missing date without inventing zeros', () => {
  const data = input(); data.coverage[0].last_date = '2026-09-26';
  assert.equal(buildRecoveryPlan(data).ranges[0].start_date, '2026-09-27');
});
for (const mutate of [
  (data) => data.coverage.pop(), (data) => data.coverage[0].last_date = null,
  (data) => data.coverage[0].last_date = '2026-10-26', (data) => data.as_of_date = '2026-02-30',
  (data) => data.account_ids.push('1234567890'), (data) => data.coverage[0].account_id = '9999999999',
]) test('rejects incomplete, duplicate, future or foreign coverage', () => {
  const data = input(); mutate(data); assert.throws(() => buildRecoveryPlan(data));
});
test('dry run contacts only the approved endpoint and never requests writes', async () => {
  const calls = [];
  const receipts = await executeRecoveryPlan(buildRecoveryPlan(input()), { ...config, mode: 'dry-run', fetchImpl: async (url, init) => {
    const body = JSON.parse(init.body); calls.push(body);
    assert.equal(url, config.projectUrl + '/functions/v1/sync-google-ads');
    assert.equal(init.redirect, 'error'); assert.deepEqual(body.expected_account_ids, ['1234567890']);
    return result(body);
  } });
  assert.equal(receipts.length, 4); assert.ok(calls.every((body) => body.dry_run === true));
});
test('writes require exact plan approval and destination before any request', async () => {
  const plan = buildRecoveryPlan(input()); let calls = 0;
  const fetchImpl = async () => { calls++; };
  for (const options of [{ approvedPlanSha256: 'wrong' }, { projectUrl: 'https://different.invalid', approvedPlanSha256: planHash(plan) }]) {
    await assert.rejects(executeRecoveryPlan(plan, { ...config, mode: 'write', fetchImpl, ...options }));
  }
  assert.equal(calls, 0);
});
test('all preflights finish before sequential writes, using identical approved ranges', async () => {
  const plan = buildRecoveryPlan(input()); const calls = [];
  await executeRecoveryPlan(plan, { ...config, mode: 'write', approvedPlanSha256: planHash(plan), fetchImpl: async (_url, init) => {
    const body = JSON.parse(init.body); calls.push(body); return result(body);
  } });
  assert.deepEqual(calls.map((body) => body.dry_run), [true, true, true, true, false, false, false, false]);
  assert.deepEqual(calls.slice(4).map(({ start_date, end_date }) => ({ start_date, end_date })), plan.ranges);
});
test('partial domain failure stops remaining writes without leaking provider messages', async () => {
  const plan = buildRecoveryPlan(input()); const journal = []; let calls = 0;
  await assert.rejects(executeRecoveryPlan(plan, { ...config, mode: 'write', approvedPlanSha256: planHash(plan), onReceipt: async (r) => journal.push(r), fetchImpl: async (_url, init) => {
    const body = JSON.parse(init.body); calls++;
    return calls === 5 ? result(body, { ok: false, database_write_status: 'partial_success', error: 'SECRET_NEVER_LOG', details: 'REFRESH_NEVER_LOG' }, 500) : result(body);
  } }), RecoveryStopped);
  assert.equal(calls, 5); assert.equal(journal.at(-1).database_write_status, 'partial_success');
  assert.doesNotMatch(JSON.stringify(journal), /SECRET_NEVER_LOG|REFRESH_NEVER_LOG/);
});
test('response loss during write is indeterminate, never retried', async () => {
  const plan = buildRecoveryPlan(input()); let calls = 0; const receipts = [];
  await assert.rejects(executeRecoveryPlan(plan, { ...config, mode: 'write', approvedPlanSha256: planHash(plan), onReceipt: async (r) => receipts.push(r), fetchImpl: async (_url, init) => {
    const body = JSON.parse(init.body); calls++; if (calls === 5) throw new Error('SECRET_NEVER_LOG'); return result(body);
  } }), RecoveryStopped);
  assert.equal(calls, 5); assert.equal(receipts.at(-1).status, 'indeterminate');
});
for (const extra of [
  { google_ads_configuration: { account_ids: ['9999999999'] } },
  { counts: { daily: -1 } }, { request: { client_slug: 'wrong' } },
  { database_write_performed: true }, { mode: 'write' },
  { recovery_contract_version: undefined },
]) test('unsafe or inconsistent dry run halts before writes', async () => {
  const plan = buildRecoveryPlan(input()); let calls = 0;
  await assert.rejects(executeRecoveryPlan(plan, { ...config, mode: 'write', approvedPlanSha256: planHash(plan), fetchImpl: async (_url, init) => {
    calls++; return result(JSON.parse(init.body), extra);
  } }), RecoveryStopped);
  assert.equal(calls, 1);
});
test('altered plan cannot widen the range', async () => {
  const plan = buildRecoveryPlan(input()); plan.ranges[0].start_date = '2020-01-01';
  await assert.rejects(executeRecoveryPlan(plan, { ...config, mode: 'dry-run' }));
});
