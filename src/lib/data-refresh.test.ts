import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({demo:false,calls:[] as Array<Record<string,unknown>>,error:false}));
vi.mock("./api",()=>({getClientId:async()=>1,get isDemoMode(){return state.demo;}}));
vi.mock("./supabase",()=>({supabase:{from:(table:string)=>{const args:Record<string,unknown>={table};state.calls.push(args);const q={select:()=>q,eq:(k:string,v:unknown)=>{args[k]=v;return q;},order:()=>q,limit:()=>q,maybeSingle:async()=>({data:table==="dashboard_sync_runs"?{completed_at:"2026-10-23T04:00:00Z"}:{metric_date:args.source==="google_ads"?"2026-09-27":"2026-10-22"},error:state.error?new Error("denied"):null})};return q;}}}));
vi.mock("./creative-previews",()=>({clearCreativePreviewCache:vi.fn()}));
import {getSourceFreshness,reloadDashboardData} from "./data-refresh";
import {clearCreativePreviewCache} from "./creative-previews";
beforeEach(()=>{state.demo=false;state.error=false;state.calls=[];vi.clearAllMocks();});
describe("read-only marketing reload",()=>{
 it("consulta cliente e fonte sem confundir data de sucesso com cobertura",async()=>{const r=await getSourceFreshness();expect(r).toHaveLength(3);expect(r.find(x=>x.source==="google_ads")?.latestDate).toBe("2026-09-27");expect(state.calls).toHaveLength(6);expect(state.calls.every(x=>x.client_id===1)).toBe(true);expect(state.calls.filter(x=>x.table==="dashboard_sync_runs").every(x=>x.status==="success")).toBe(true);});
 it("demo não consulta produção nem inventa datas de sincronização",async()=>{state.demo=true;expect((await getSourceFreshness()).every(x=>x.completedAt===null&&x.latestDate===null)).toBe(true);expect(state.calls).toEqual([]);});
 it("falha de leitura não vira sucesso ou data atual",async()=>{state.error=true;await expect(getSourceFreshness()).rejects.toThrow("denied");});
 it("refaz consultas reais do cache e preserva contextos comerciais",async()=>{const client=new QueryClient({defaultOptions:{queries:{retry:false}}});let n=1;const fetch=vi.fn(async()=>n);await client.fetchQuery({queryKey:["fronts","periodo"],queryFn:fetch});await client.fetchQuery({queryKey:["site-overview"],queryFn:fetch});client.setQueryData(["manual-business-data"],{keep:true});n=2;await reloadDashboardData(client);expect(client.getQueryData(["fronts","periodo"])).toBe(2);expect(client.getQueryData(["site-overview"])).toBe(2);expect(client.getQueryData(["manual-business-data"])).toEqual({keep:true});expect(clearCreativePreviewCache).toHaveBeenCalledOnce();client.clear();});
 it("falha de refetch é propagada",async()=>{const client=new QueryClient();vi.spyOn(client,"invalidateQueries").mockRejectedValue(new Error("network"));await expect(reloadDashboardData(client)).rejects.toThrow("network");client.clear();});
});
