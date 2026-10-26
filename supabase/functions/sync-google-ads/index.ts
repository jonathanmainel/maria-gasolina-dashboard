import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { handleGoogleAds } from "./handler.ts";

export default { fetch: withSupabase({ auth: "secret" }, handleGoogleAds) };
