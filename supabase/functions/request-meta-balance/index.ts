import { createClient } from "@supabase/supabase-js";
import { balanceDependencies } from "../_shared/meta-balance-backend.ts";
import { handleMetaBalance } from "../_shared/meta-balance-runner.ts";

Deno.serve(async (req: Request) => {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return Response.json({ error_code: "BALANCE_CONFIGURATION_ERROR" }, { status: 503 });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return handleMetaBalance(req, balanceDependencies(admin, "manual"));
});
