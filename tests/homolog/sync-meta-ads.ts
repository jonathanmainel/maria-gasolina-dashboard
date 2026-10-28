import collector from "../../supabase/functions/sync-meta-ads/index.ts";
import { createHomologCollector } from "./transport.ts";
export default await createHomologCollector("meta_ads", collector);
