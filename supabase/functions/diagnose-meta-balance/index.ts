import { createSupabaseContext } from "@supabase/server";
import { createMetaBalanceDiagnostic } from "../_shared/meta-balance-diagnostic.ts";
import { META_BALANCE_ACCOUNT_ID, META_BALANCE_PROJECT_ID } from "../_shared/meta-balance-config.ts";
import { readMetaFundingResponse } from "../_shared/meta-balance.ts";

// New, temporary endpoint ONLY. No SQL client, logger, campaign call or persistence.
const handler = createMetaBalanceDiagnostic({
  enabled: Deno.env.get("META_BALANCE_DIAGNOSTIC_ENABLED") === "true"
    && Deno.env.get("SUPABASE_URL") === `https://${META_BALANCE_PROJECT_ID}.supabase.co`,
  expiresAt: Deno.env.get("META_BALANCE_DIAGNOSTIC_EXPIRES_AT") ?? "",
  now: () => new Date(),
  authorize: async req => {
    const { error } = await createSupabaseContext(req, { auth: "secret" });
    return !error;
  },
  read: () => readMetaFundingResponse({ accountId: META_BALANCE_ACCOUNT_ID,
    token: Deno.env.get("META_ACCESS_TOKEN") ?? "", version: Deno.env.get("META_API_VERSION") ?? "" }),
});
Deno.serve(handler);
