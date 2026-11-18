import { readMetaAvailableFunds } from "./meta-balance.ts";
import type { BalanceDependencies } from "./meta-balance-runner.ts";
import { META_BALANCE_ACCOUNT_ID, META_BALANCE_CLIENT_SLUG } from "./meta-balance-config.ts";

// Credentials stay in the Edge runtime; never return or log environment values.
export function balanceDependencies(admin: any, mode: "manual" | "scheduled"): BalanceDependencies {
  const token = Deno.env.get("META_ACCESS_TOKEN") ?? "";
  const version = Deno.env.get("META_API_VERSION") ?? "";
  return {
    enabled: Deno.env.get("META_BALANCE_ENABLED") === "true" && Deno.env.get("META_BALANCE_FORMAT_VALIDATED") === "true" && !!token && !!version
      && (mode === "manual" || Deno.env.get("META_BALANCE_SCHEDULE_ENABLED") === "true"),
    accountId: META_BALANCE_ACCOUNT_ID,
    clientSlug: META_BALANCE_CLIENT_SLUG,
    mode,
    getUser: async token => {
      const { data, error } = await admin.auth.getUser(token);
      return error || !data.user || data.user.is_anonymous ? null : { id: data.user.id };
    },
    rpc: (name, args) => admin.rpc(name, args).abortSignal(AbortSignal.timeout(10000)),
    collect: accountId => readMetaAvailableFunds({ accountId, token, version }),
  };
}
