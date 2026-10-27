import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { handleManualSync } from "./handler.ts";

Deno.serve(async (req: Request) => {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return Response.json({ error_code: "SERVER_CONFIGURATION_ERROR" }, { status: 503 });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, redirect: "error", signal: AbortSignal.timeout(15000) }) } });
  return await handleManualSync(req, {
    getUser: async (token) => {
      const { data, error } = await admin.auth.getUser(token);
      return error || !data.user || data.user.is_anonymous ? null : { id: data.user.id };
    },
    rpc: (name, args) => admin.rpc(name, args),
  });
});
