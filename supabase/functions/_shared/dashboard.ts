import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type DashboardSource =
  | "meta_ads"
  | "google_ads"
  | "ga4";

type SupabaseAdminClient = SupabaseClient<any>;

export function resolveDashboardClient(
  supabaseAdmin: SupabaseAdminClient,
  clientSlug: string,
) {
  return supabaseAdmin
    .from("dashboard_clients")
    .select("id, slug, name")
    .eq("slug", clientSlug)
    .eq("active", true)
    .maybeSingle();
}

export function validateSourceAccount(
  supabaseAdmin: SupabaseAdminClient,
  params: {
    clientId: number;
    source: DashboardSource;
    accountId: string;
  },
) {
  return supabaseAdmin
    .from("dashboard_source_accounts")
    .select("id, account_id, account_name")
    .eq("client_id", params.clientId)
    .eq("source", params.source)
    .eq("account_id", params.accountId)
    .eq("active", true)
    .maybeSingle();
}

export function listSourceAccounts(
  supabaseAdmin: SupabaseAdminClient,
  params: {
    clientId: number;
    source: DashboardSource;
  },
) {
  return supabaseAdmin
    .from("dashboard_source_accounts")
    .select("id, account_id, account_name")
    .eq("client_id", params.clientId)
    .eq("source", params.source)
    .eq("active", true)
    .order("id", { ascending: true });
}
