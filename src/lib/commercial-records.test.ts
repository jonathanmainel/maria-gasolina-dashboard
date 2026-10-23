import { describe, expect, it } from "vitest";
import { commercialFronts } from "./fronts";
import { crmModels, crmStages } from "./crm-stages";
import { buildCrmSummary } from "./crm";
import { commercialExamples, exampleEntries } from "./commercial-examples";
import { commercialPayload, commercialScope, decodeCommercialRows, emptyCommercialEntries, validCommercialRange, validCommercialValues, type CommercialCommand } from "./commercial-records";
import { resolveCommercialAccess } from "./commercial-access";
import type { CommercialFront } from "../types";
const range = { start: "2026-10-01", end: "2026-10-23" };
const snapshot = (front: CommercialFront) => ({ stages: Object.fromEntries(crmStages(front).map((stage,index) => [stage.id,index+1])), stage_days: Object.fromEntries(crmStages(front).filter(stage=>stage.tracksDays).map(stage=>[stage.id,1.5])), avg_ticket: 12000 });
const row = (front: CommercialFront, kind: CommercialCommand["kind"], window = range) => ({ scope: commercialScope(front,kind,window), payload: commercialPayload({ front,kind,range:window,values:kind==="snapshot"?snapshot(front):{contracts_closed:3,revenue:36000} }), updated_at:"2026-10-23T12:00:00Z" });

describe("dois modelos comerciais compartilhados",()=>{
 it("existem somente Places e Expansão",()=>expect(Object.keys(crmModels).sort()).toEqual(["expansion","places"]));
 it.each(Object.keys(commercialFronts) as CommercialFront[])("%s usa o modelo central correto",front=>{
  expect(crmStages(front)).toBe(crmModels[commercialFronts[front].funnelModel]);
  expect(crmStages(front)).toHaveLength(front==="franchise"?10:8);
  expect(crmStages(front).at(-1)?.kind).toBe("post_sale");
 });
 it("não amplia frentes publicitárias para criar o funil",()=>{
  const summary=buildCrmSummary("company",snapshot("company"),{contracts_closed:3,revenue:36000},{rows:[]});
  expect(summary.monthly).toEqual([]);expect(summary.sources).toEqual([]);expect(summary.contracts).toBe(3);expect(summary.revenue).toBe(36000);
 });
});
describe("registros por frente, natureza e período",()=>{
 it("todas as frentes começam sem registros, não com zero",()=>{
  for(const entry of Object.values(emptyCommercialEntries())){expect(entry.snapshot).toBeNull();expect(entry.result).toBeNull();}
 });
 it.each(Object.keys(commercialFronts) as CommercialFront[])("salvar %s não preenche as demais frentes",front=>{
  const entries=decodeCommercialRows([row(front,"snapshot"),row(front,"result")],range);
  expect(entries[front].snapshot).toEqual(snapshot(front));expect(entries[front].result?.contracts_closed).toBe(3);
  for(const other of Object.keys(entries) as CommercialFront[]) if(other!==front)expect(entries[other]).toEqual(emptyCommercialEntries()[other]);
 });
 it("resultado de outro período ou de período parcial fica indisponível; snapshot é independente",()=>{
  const entries=decodeCommercialRows([row("company","snapshot"),row("company","result")],{...range,end:"2026-10-22"});
  expect(entries.company.snapshot).not.toBeNull();expect(entries.company.result).toBeNull();
 });
 it("confere o período no payload, não apenas no scope",()=>{
  const bad=row("company","result");bad.payload.period={...range,end:"2026-10-22"};expect(decodeCommercialRows([bad],range).company.result).toBeNull();
 });
 it("ignora legado, exemplos e envelope sem versão",()=>{
  for(const payload of [{funnel:commercialExamples},{...row("company","result").payload,origin:"example"},{...row("company","result").payload,version:0}])expect(decodeCommercialRows([{...row("company","result"),payload}],range).company.result).toBeNull();
 });
 it("scope pertence à mesma frente do payload",()=>{
  const bad={...row("company","snapshot"),scope:commercialScope("condominium","snapshot",range)};expect(decodeCommercialRows([bad],range).company.snapshot).toBeNull();
 });
 it("identificação do período é válida e respeita o limite do banco",()=>{
  expect(validCommercialRange(range)).toBe(true);expect(validCommercialRange({start:"2026-02-30",end:"2026-03-01"})).toBe(false);
  expect(validCommercialRange({...range,start:"2026-11-01"})).toBe(false);
  for(const front of Object.keys(commercialFronts) as CommercialFront[])expect(commercialScope(front,"result",range)).toMatch(/^[a-z0-9_]{3,40}$/);
 });
 it("campos ausentes não são preenchidos por defaults",()=>{
  expect(validCommercialValues("company","snapshot",{stages:{lead:1},stage_days:{},avg_ticket:0})).toBe(false);
  expect(()=>commercialPayload({front:"company",kind:"result",range,values:{contracts_closed:NaN,revenue:0}})).toThrow();
 });
 it("tempos e ticket opcionais permanecem desconhecidos sem bloquear contagens válidas",()=>{
  const input={stages:snapshot("company").stages,stage_days:{}};
  expect(validCommercialValues("company","snapshot",input)).toBe(true);
  const crm=buildCrmSummary("company",input,null,{rows:[]});expect(crm.avg_cycle_days).toBeNull();expect(crm.avg_ticket).toBeNull();expect(crm.stages[0].avg_days).toBeNull();expect(crm.open_opportunities).toBe(21);
 });
 it("zero informado continua sendo um registro conhecido",()=>{
  const zero=row("company","result");zero.payload.values={contracts_closed:0,revenue:0};expect(decodeCommercialRows([zero],range).company.result).toEqual({contracts_closed:0,revenue:0});
 });
 it("não deriva contratos do estoque nem soma Implantação ao pipeline aberto",()=>{
  const input=snapshot("company");input.stages.contract=99;input.stages.implementation=900;
  const crm=buildCrmSummary("company",input,{contracts_closed:3,revenue:36000},{rows:[]});
  expect(crm.contracts).toBe(3);expect(crm.open_opportunities).toBe(21);expect(crm.avg_cycle_days).toBe(9);expect(crm.avg_ticket).toBe(12000);
 });
});
describe("prévia e permissões",()=>{
 it("exemplos só existem para Condomínios e Franquias e não são sequências cumulativas",()=>{
  expect(Object.keys(commercialExamples).sort()).toEqual(["condominium","franchise"]);
  const entries=exampleEntries();expect(entries.company.snapshot).toBeNull();expect(entries.gym.result).toBeNull();expect(entries.hospital.snapshot).toBeNull();
  expect(commercialExamples.condominium!.snapshot.stages.contact).toBeGreaterThan(commercialExamples.condominium!.snapshot.stages.lead);
 });
 it("cada prévia recebe uma cópia independente",()=>{
  const first=exampleEntries();first.condominium.snapshot!.stages.lead=999;expect(exampleEntries().condominium.snapshot!.stages.lead).not.toBe(999);
 });
 it.each([null,"viewer","editor","admin"] as const)("perfil %s fica bloqueado sem a nova RLS",role=>{expect(resolveCommercialAccess(role,false).canEdit).toBe(false);expect(resolveCommercialAccess(role,false).canManage).toBe(false);});
 it.each([null,"viewer","editor","admin"] as const)("perfil %s respeita suas capacidades após a liberação",role=>{const access=resolveCommercialAccess(role,true);expect(access.canEdit).toBe(role==="editor"||role==="admin");expect(access.canManage).toBe(role==="admin");});
});
