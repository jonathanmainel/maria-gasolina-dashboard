import collector from "../../supabase/functions/sync-ga4/index.ts";
import { createHomologCollector } from "./transport.ts";
export default await createHomologCollector("ga4", collector);
