import collector from "../../supabase/functions/sync-google-ads/index.ts";
import { createHomologCollector } from "./transport.ts";
export default await createHomologCollector("google_ads", collector);
