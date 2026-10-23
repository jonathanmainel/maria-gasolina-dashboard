// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ role: "admin", ready: true, demo: false, count: 1, error: null as Error | null }));
const calls = vi.hoisted(() => [] as unknown[][]);
vi.mock("./api", () => ({ CLIENT_SLUG: "maria-gasolina", get isDemoMode() { return state.demo; } }));
vi.mock("./commercial-access", () => ({ loadCommercialAccess: async () => ({ role: state.role, policyReady: state.ready, canManage: state.ready && state.role === "admin", clientId: 1, userId: "admin" }) }));
vi.mock("./supabase", () => ({ supabase: { from: (table: string) => {
  calls.push(["table", table]); const filters: Record<string, unknown> = {};
  const chain = { delete: () => { calls.push(["delete"]); return chain; }, eq: (key: string, value: unknown) => { calls.push([key, value]); filters[key] = value; return chain; }, select: async () => ({ data: Array.from({ length: state.count }, () => ({ scope: filters.scope })), error: state.error }) }; return chain;
} } }));
import { deleteCommercialRecord } from "./commercial-data";
const command = { front: "hospital" as const, kind: "result" as const, range: { start: "2026-10-01", end: "2026-10-23" } };
beforeEach(() => { state.role="admin";state.ready=true;state.demo=false;state.count=1;state.error=null;calls.length=0; });
describe("exclusão comercial com autorização e representação de linhas", () => {
  it.each(["viewer", "editor", "manager"])("%s não inicia exclusão", async role => { state.role=role; await expect(deleteCommercialRecord(command)).rejects.toThrow("Somente admin"); expect(calls).toEqual([]); });
  it("admin com gate bloqueado também não inicia exclusão", async () => {state.ready=false;await expect(deleteCommercialRecord(command)).rejects.toThrow();expect(calls).toEqual([]);});
  it("revalida o papel em cada tentativa e limita cliente/frente/período", async () => {
    await deleteCommercialRecord(command);expect(calls).toContainEqual(["client_id",1]);expect(calls).toContainEqual(["scope","crm_res_hospital_20261001_20261023"]);
    calls.length=0;state.role="viewer";await expect(deleteCommercialRecord(command)).rejects.toThrow();expect(calls).toEqual([]);
  });
  it("sucesso HTTP com zero linhas não é exclusão autorizada",async()=>{state.count=0;await expect(deleteCommercialRecord(command)).rejects.toThrow("Nenhum registro excluído");});
  it("negação do servidor é propagada",async()=>{state.error=new Error("RLS negou");await expect(deleteCommercialRecord(command)).rejects.toThrow("RLS negou");});
  it("scope business ou frente desconhecida nunca chegam ao transporte",async()=>{await expect(deleteCommercialRecord({...command,front:"business" as any})).rejects.toThrow();await expect(deleteCommercialRecord({...command,kind:"business" as any})).rejects.toThrow();expect(calls).toEqual([]);});
  it("demo não usa a exclusão operacional",async()=>{state.demo=true;await expect(deleteCommercialRecord(command)).rejects.toThrow("demonstrativos");expect(calls).toEqual([]);});
});
