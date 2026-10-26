import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const DOMAINS = ['daily', 'campaigns', 'ad_groups', 'ads', 'keywords', 'pmax_asset_groups', 'pmax_assets'];
const isoDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const day = (value, offset) => new Date(Date.parse(value) + offset * 86400000).toISOString().slice(0, 10);
const sorted = (values) => [...values].sort();
export const planHash = (plan) => createHash('sha256').update(JSON.stringify(plan)).digest('hex');

export function buildRecoveryPlan(input) {
  const { project_ref, client_slug, account_ids, coverage, as_of_date } = input;
  if (!/^[a-z]{20}$/.test(project_ref) || !/^[a-z0-9-]+$/.test(client_slug) || !isoDate(as_of_date) ||
    !Array.isArray(account_ids) || !account_ids.length || new Set(account_ids).size !== account_ids.length ||
    account_ids.some((id) => typeof id !== 'string' || !/^\d{10}$/.test(id)) || !Array.isArray(coverage)) {
    throw new Error('Invalid recovery scope or date.');
  }
  if (coverage.length !== DOMAINS.length * account_ids.length) throw new Error('Coverage must include every account and domain.');
  for (const account of account_ids) for (const domain of DOMAINS) {
    const rows = coverage.filter((row) => row.account_id === account && row.domain === domain);
    if (rows.length !== 1 || !isoDate(rows[0].last_date) || rows[0].last_date > day(as_of_date, -1)) {
      throw new Error('Missing, duplicate or unexpected coverage; reconcile before planning.');
    }
  }
  // Re-query every domain from the earliest missing date. Upserts replace values;
  // they do not add metrics. Differences in domain activity are not filled with zeros.
  const start = day(sorted(coverage.map((row) => row.last_date))[0], 1);
  const end = day(as_of_date, -1);
  const ranges = [];
  for (let cursor = start; cursor <= end;) {
    const finish = day(cursor, 6) < end ? day(cursor, 6) : end;
    ranges.push({ start_date: cursor, end_date: finish });
    cursor = day(finish, 1);
  }
  return {
    version: 1, project_ref, client_slug, account_ids: sorted(account_ids), as_of_date,
    time_zone: 'America/Sao_Paulo', coverage, ranges,
    partial_today: { start_date: as_of_date, end_date: as_of_date, dry_run_only: true },
  };
}

function validatePlan(plan) {
  const rebuilt = buildRecoveryPlan(plan);
  if (JSON.stringify(rebuilt) !== JSON.stringify(plan)) throw new Error('Plan changed; rebuild and approve the new plan.');
}

export class RecoveryStopped extends Error {
  constructor(receipt) { super('Recovery stopped; inspect receipt before any new operation.'); this.receipt = receipt; }
}

export async function executeRecoveryPlan(plan, options) {
  validatePlan(plan);
  const { mode, projectUrl, secretKey, approvedPlanSha256, fetchImpl = fetch, onReceipt = async () => {} } = options;
  if (!['dry-run', 'write'].includes(mode)) throw new Error('Unsupported mode.');
  const expectedUrl = `https://${plan.project_ref}.supabase.co`;
  if (projectUrl !== expectedUrl || typeof secretKey !== 'string' || !secretKey.startsWith('sb_secret_')) {
    throw new Error('Destination mismatch or missing backend secret key.');
  }
  if (mode === 'write' && approvedPlanSha256 !== planHash(plan)) throw new Error('Explicit approval of this exact plan is required.');

  const receipts = [];
  async function request(range, dryRun) {
    const body = { client_slug: plan.client_slug, ...range, dry_run: dryRun, expected_account_ids: plan.account_ids };
    let response;
    let result;
    try {
      response = await fetchImpl(`${expectedUrl}/functions/v1/sync-google-ads`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(120000),
        headers: { 'Content-Type': 'application/json', apikey: secretKey, Authorization: `Bearer ${secretKey}` },
        body: JSON.stringify(body),
      });
      result = await response.json();
    } catch {
      const receipt = { ...range, dry_run: dryRun, status: dryRun ? 'dry_run_failed' : 'indeterminate', http_status: response?.status ?? null };
      await onReceipt(receipt);
      throw new RecoveryStopped(receipt);
    }
    const accounts = result?.google_ads_configuration?.account_ids;
    const requestMatches = result?.request?.client_slug === plan.client_slug &&
      result?.request?.start_date === range.start_date && result?.request?.end_date === range.end_date &&
      result?.request?.dry_run === dryRun;
    const accountsMatch = Array.isArray(accounts) && JSON.stringify(sorted(accounts)) === JSON.stringify(plan.account_ids);
    const counts = result?.counts;
    const countsValid = counts && DOMAINS.every((key) => Number.isSafeInteger(counts[key]) && counts[key] >= 0);
    const valid = response.ok && result?.ok === true && result.recovery_contract_version === 1 && accountsMatch && requestMatches && countsValid &&
      result.mode === (dryRun ? 'dry_run' : 'write') &&
      (dryRun ? result.database_write_performed === false :
        result.database_write_status === 'success' ? result.database_write_performed === true :
        ['already_processed', 'no_data'].includes(result.database_write_status) && result.database_write_performed === false);
    // Do not copy provider error descriptions, headers or normalized previews into logs.
    const receipt = { ...range, dry_run: dryRun, http_status: response.status,
      status: valid ? (dryRun ? 'validated' : result.database_write_status) : 'stopped',
      database_write_performed: result?.database_write_performed === true,
      database_write_status: ['success', 'partial_success', 'already_processed', 'no_data'].includes(result?.database_write_status) ? result.database_write_status : null,
      ...(valid ? { counts: Object.fromEntries(DOMAINS.map((key) => [key, counts[key]])) } : {}),
    };
    receipts.push(receipt);
    await onReceipt(receipt);
    if (!valid) throw new RecoveryStopped(receipt);
  }
  // Complete all read-only preflights before making the first write. No retries,
  // background dispatch, parallel batches, today writes, deletes or other sources.
  for (const range of plan.ranges) await request(range, true);
  if (mode === 'write') for (const range of plan.ranges) await request(range, false);
  return receipts;
}

async function main() {
  const [command, inputPath, outputPath, approvedPlanSha256] = process.argv.slice(2);
  if (!['plan', 'dry-run', 'write'].includes(command) || !inputPath || !outputPath) {
    throw new Error('Usage: node scripts/google-ads-recovery.mjs plan|dry-run|write INPUT OUTPUT [APPROVED_PLAN_SHA256]');
  }
  const input = JSON.parse(await readFile(inputPath, 'utf8'));
  if (command === 'plan') {
    const plan = buildRecoveryPlan(input);
    await writeFile(outputPath, JSON.stringify({ plan, sha256: planHash(plan) }, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ status: 'plan_ready', sha256: planHash(plan), batches: plan.ranges.length }));
    return;
  }
  if (input.sha256 !== planHash(input.plan)) throw new Error('Plan integrity check failed.');
  const journal = { plan_sha256: input.sha256, mode: command, receipts: [] };
  await writeFile(outputPath, JSON.stringify(journal, null, 2), { flag: 'wx' });
  await executeRecoveryPlan(input.plan, {
    mode: command, approvedPlanSha256, projectUrl: process.env.SUPABASE_URL,
    secretKey: process.env.SUPABASE_SECRET_KEY,
    onReceipt: async (receipt) => {
      journal.receipts.push(receipt);
      await writeFile(outputPath, JSON.stringify(journal, null, 2));
    },
  });
  console.log(JSON.stringify({ status: 'completed', mode: command, batches: input.plan.ranges.length }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    // Never serialize exception/cause from HTTP, filesystem paths or provider bodies.
    console.error(error instanceof RecoveryStopped ? 'Recovery stopped; inspect the local journal.' : 'Recovery could not start; check scope, approval and local configuration.');
    process.exitCode = 1;
  });
}
