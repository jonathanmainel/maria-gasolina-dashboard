// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { commercialFronts } from "../lib/fronts";
import { emptyCommercialEntries } from "../lib/commercial-records";
import { resolveCommercialAccess } from "../lib/commercial-access";
import { buildCrmSummary } from "../lib/crm";
import type { CommercialFront } from "../types";
import type { DashboardData } from "../lib/use-dashboard";
const remove=vi.hoisted(()=>vi.fn(async(_:unknown)=>undefined));
vi.mock("../lib/api",()=>({isDemoMode:false,CLIENT_SLUG:"maria-gasolina"}));
vi.mock("../lib/supabase",()=>({supabase:null}));
vi.mock("../lib/goals",()=>({useGoals:()=>({})}));
vi.mock("../lib/commercial-data",()=>({useSaveCommercialRecord:()=>({mutateAsync:async()=>undefined}),useDeleteCommercialRecord:()=>({mutateAsync:remove,isPending:false})}));
import { CrmView } from "./Crm";
const range={start:"2026-10-01",end:"2026-10-23"};
const fixture=(role:"viewer"|"editor"|"admin",ready=true)=>{
 const entries=emptyCommercialEntries();entries.franchise.result={contracts_closed:2,revenue:100};
 return {crm:Object.fromEntries(Object.keys(commercialFronts).map(front=>[front,buildCrmSummary(front as CommercialFront,null,null,{rows:[]})])),commercial:{entries,access:resolveCommercialAccess(role,ready)},franchise:{rows:[]},condominium:{rows:[]}} as unknown as DashboardData;
};
afterEach(()=>{cleanup();remove.mockClear();});
describe("confirmação da exclusão de um único registro",()=>{
 it.each(["viewer","editor"] as const)("%s não recebe ação de excluir",role=>{render(<CrmView data={fixture(role)} range={range}/>);expect(screen.queryByText("Excluir resultado do período")).toBeNull();});
 it("admin confirma frente, natureza e período; cancelar não escreve",async()=>{
  render(<CrmView data={fixture("admin")} range={range}/>);fireEvent.click(screen.getByText("Excluir resultado do período"));expect(screen.getByRole("alertdialog").textContent).toContain("Franquias");fireEvent.click(screen.getByText("Cancelar exclusão"));expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Excluir resultado do período"));fireEvent.click(screen.getByText("Confirmar exclusão"));await waitFor(()=>expect(remove).toHaveBeenCalledWith({front:"franchise",kind:"result",range}));
 });
 it("compartilhamento, prévia e gate bloqueado não mostram exclusão",()=>{
  const {rerender}=render(<CrmView data={fixture("admin",false)} range={range}/>);expect(screen.queryByText("Excluir resultado do período")).toBeNull();
  rerender(<CrmView data={fixture("admin")} range={range} readOnly/>);expect(screen.queryByText("Excluir resultado do período")).toBeNull();
  rerender(<CrmView data={fixture("admin")} range={range} preview/>);expect(screen.queryByText("Excluir resultado do período")).toBeNull();
 });
 it("perda de permissão fecha a confirmação e desabilita a ação",()=>{
  const {rerender}=render(<CrmView data={fixture("admin")} range={range}/>);fireEvent.click(screen.getByText("Excluir resultado do período"));rerender(<CrmView data={fixture("viewer")} range={range}/>);expect(screen.queryByRole("alertdialog")).toBeNull();expect(remove).not.toHaveBeenCalled();
 });
});
