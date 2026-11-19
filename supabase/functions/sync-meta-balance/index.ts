import { withSupabase } from "@supabase/server";
import { balanceDependencies } from "../_shared/meta-balance-backend.ts";
import { handleMetaBalance } from "../_shared/meta-balance-runner.ts";

// Scheduled entry point uses the same server-secret authentication as media
// collectors, but never calls their reservations, ingestion or campaign APIs.
export default { fetch: withSupabase({ auth: "secret" }, (req, ctx) =>
  handleMetaBalance(req, balanceDependencies(ctx.supabaseAdmin, "scheduled"))) };
