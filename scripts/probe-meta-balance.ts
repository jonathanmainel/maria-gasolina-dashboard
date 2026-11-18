// Run only inside an authorized backend with its private environment injected.
// This script has no Supabase client and cannot persist a financial entry.
import { BalanceError, readMetaAvailableFunds } from "../supabase/functions/_shared/meta-balance.ts";

const accountId = Deno.env.get("META_BALANCE_ACCOUNT_ID") ?? "";
try {
  const result = await readMetaAvailableFunds({ accountId, token: Deno.env.get("META_ACCESS_TOKEN") ?? "", version: Deno.env.get("META_API_VERSION") ?? "" });
  // Minimal result for a private operator console; no raw provider body or token.
  console.log(JSON.stringify({ ok: true, account_id: accountId, ...result, database_write_performed: false }));
} catch (error) {
  console.log(JSON.stringify({ ok: false, error_code: error instanceof BalanceError ? error.code : "META_API_FAILED", database_write_performed: false }));
  Deno.exitCode = 1;
}
