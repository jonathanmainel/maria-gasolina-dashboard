// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CrmView } from "./Crm";
import { CommercialFrontSelector } from "../components/CommercialFrontSelector";
import { CommercialFunnelPanel } from "../components/CommercialFunnelPanel";
import { commercialFronts, frontsForCategory } from "../lib/fronts";
import { crmStages } from "../lib/crm-stages";
import { buildCrmSummary } from "../lib/crm";
import { emptyCommercialEntries } from "../lib/commercial-records";
import { resolveCommercialAccess } from "../lib/commercial-access";
import type { CommercialFront } from "../types";
import type { DashboardData } from "../lib/use-dashboard";
const saved = vi.hoisted(() => vi.fn(async (_: unknown) => undefined));
vi.mock("../lib/commercial-data", () => ({useDeleteCommercialRecord:()=>({mutateAsync:async()=>undefined}),useSaveCommercialRecord:()=>({mutateAsync:saved})}));
vi.mock("../lib/api", () => ({isDemoMode:false,CLIENT_SLUG:"maria-gasolina"}));
vi.mock("../lib/goals", () => ({useGoals:()=>({contracts_franchise:6,contracts_condominium:8})}));
vi.mock("../lib/supabase", () => ({supabase:null}));
beforeAll(()=>{window.matchMedia ??= ((media:string)=>({media,matches:true,addEventListener(){},removeEventListener(){}})) as any;});
afterEach(()=>{cleanup();saved.mockClear();});
const range={start:"2026-10-01",end:"2026-10-23"};
function data(role: "viewer"|"editor"|"admin"="viewer",ready=true):DashboardData {
 return { crm:Object.fromEntries(Object.keys(commercialFronts).map(id=>[id,buildCrmSummary(id as CommercialFront,null,null,{rows:[]})])), commercial:{entries:emptyCommercialEntries(),access:resolveCommercialAccess(role,ready),isError:false}, franchise:{rows:[]},condominium:{rows:[]} } as unknown as DashboardData;
}
const value=(label:string)=>[...document.querySelectorAll('.kpi')].find(node=>node.querySelector('.kpi-top p')?.textContent===label)?.querySelector('.kpi-value strong')?.textContent;
describe("seleção hierárquica de Vendas",()=>{
 it("Expansão não mostra seletor redundante; Places deriva as quatro opções do registro",()=>{
  render(<CrmView range={range} data={data()} />);
  expect(screen.queryByRole('combobox')).toBeNull(); expect(document.querySelectorAll('.funnel3d-row')).toHaveLength(10);
  fireEvent.click(screen.getByRole('tab',{name:'Places'}));
  expect([...screen.getByRole('combobox').querySelectorAll('option')].map(node=>node.value)).toEqual(frontsForCategory('place').map(front=>front.id));
  expect(document.querySelectorAll('.funnel3d-row')).toHaveLength(8);
  fireEvent.change(screen.getByLabelText('Frente comercial'),{target:{value:'hospital'}});
  expect(screen.getByText('Pipeline por etapa · Hospitais')).not.toBeNull();expect(value('Contratos no período')).toBe('—');
 });
 it("segundo seletor aparece automaticamente se Expansão tiver outra frente no registro",()=>{
  const previous=commercialFronts.company.category;
  try {commercialFronts.company.category='expansion';render(<CommercialFrontSelector front="franchise" onChange={()=>{}} />);expect(screen.getByRole('combobox').querySelectorAll('option')).toHaveLength(2);} finally{commercialFronts.company.category=previous;}
 });
});
describe("perfis e edição comercial",()=>{
 it("viewer pode consultar mas não encontra controles de escrita",()=>{render(<CrmView range={range} data={data('viewer')} />);expect(screen.queryByRole('button',{name:'Editar dados'})).toBeNull();expect(screen.getByText('Seu perfil permite somente leitura dos dados comerciais.')).not.toBeNull();});
 it.each(['editor','admin'] as const)('%s edita formulário inicialmente vazio e envia frente/período explícitos',async role=>{
  render(<CrmView range={range} data={data(role)} />);fireEvent.click(screen.getAllByRole('button',{name:'Editar dados'})[1]);
  expect((screen.getByLabelText('Contratos fechados no período') as HTMLInputElement).value).toBe('');
  fireEvent.change(screen.getByLabelText('Contratos fechados no período'),{target:{value:'2'}});fireEvent.change(screen.getByLabelText('Receita do período'),{target:{value:'65000'}});
  fireEvent.click(screen.getByRole('button',{name:'Salvar resultado'}));await waitFor(()=>expect(saved).toHaveBeenCalledWith({front:'franchise',kind:'result',range,values:{contracts_closed:2,revenue:65000}}));
 });
 it("resultados e tempos explicitamente zerados continuam conhecidos na leitura",()=>{
  const original=data();const stages=crmStages('franchise');original.crm.franchise=buildCrmSummary('franchise',{stages:Object.fromEntries(stages.map(stage=>[stage.id,0])),stage_days:Object.fromEntries(stages.filter(stage=>stage.tracksDays).map(stage=>[stage.id,0]))},{contracts_closed:0,revenue:0},{rows:[]});
  render(<CrmView range={range} data={original} />);expect(value('Contratos no período')).toBe('0');expect(value('Receita no período')).toContain('0,00');expect(value('Ciclo médio de venda')).toBe('0 dias');expect(screen.getByText('Tempos comerciais informados: 0 dias.')).not.toBeNull();
 });
 it("editor sem política aprovada e versão compartilhada permanecem sem editor",()=>{const {rerender}=render(<CrmView range={range} data={data('editor',false)} />);expect(screen.queryByText('Editar dados')).toBeNull();rerender(<CrmView range={range} data={data('admin')} readOnly />);expect(screen.queryByText('Editar dados')).toBeNull();});
 it("salva o snapshot com contagens conhecidas sem inventar tempos ou ticket",async()=>{
  render(<CrmView range={range} data={data('editor')} />);fireEvent.click(screen.getAllByRole('button',{name:'Editar dados'})[0]);
  for(const stage of crmStages('franchise'))fireEvent.change(document.getElementById(`manual-stage_${stage.id}`)!,{target:{value:'2'}});
  fireEvent.click(screen.getByRole('button',{name:'Salvar pipeline'}));await waitFor(()=>expect(saved).toHaveBeenCalled());
  const command=saved.mock.calls[0][0] as {values:{stage_days:object;avg_ticket?:number}};expect(command.values.stage_days).toEqual({});expect(command.values.avg_ticket).toBeUndefined();
 });
 it("mudança de frente descarta rascunho sem salvar em outra frente",()=>{render(<CrmView range={range} data={data('editor')} />);fireEvent.click(screen.getAllByRole('button',{name:'Editar dados'})[1]);fireEvent.change(screen.getByLabelText('Receita do período'),{target:{value:'999'}});fireEvent.click(screen.getByRole('tab',{name:'Places'}));expect(screen.queryByLabelText('Receita do período')).toBeNull();expect(saved).not.toHaveBeenCalled();});
});
describe("prévia independente e mesma estrutura nas páginas individuais",()=>{
 it("exemplos não salvam e não preenchem outras frentes; retornar restaura indisponibilidade",()=>{
  const original=data('editor');const before=JSON.stringify(original);render(<CrmView range={range} data={original} />);
  fireEvent.click(screen.getByRole('button',{name:'Visualizar funis ilustrativos'}));expect(value('Contratos no período')).toBe('9');expect(screen.queryByText('Editar dados')).toBeNull();expect(screen.getByText('Dados comerciais ilustrativos.')).not.toBeNull();
  fireEvent.click(screen.getByRole('tab',{name:'Places'}));expect(value('Contratos no período')).toBe('6');fireEvent.change(screen.getByLabelText('Frente comercial'),{target:{value:'company'}});expect(value('Contratos no período')).toBe('—');
  fireEvent.click(screen.getByRole('button',{name:'Voltar aos dados reais'}));expect(value('Contratos no período')).toBe('—');expect(saved).not.toHaveBeenCalled();expect(JSON.stringify(original)).toBe(before);
 });
 it.each(Object.keys(commercialFronts) as CommercialFront[])('%s mantém estrutura mesmo sem campanhas, e mostra seu snapshot sem compartilhar valores',front=>{
  const snapshot={stages:Object.fromEntries(crmStages(front).map(stage=>[stage.id,7])),stage_days:Object.fromEntries(crmStages(front).filter(stage=>stage.tracksDays).map(stage=>[stage.id,2])),avg_ticket:12000};
  const summary={...buildCrmSummary(front,snapshot,null,{rows:[]}),snapshot_origin:'manual' as const,snapshot_updated_at:'2026-10-23T12:00:00Z'};
  render(<CommercialFunnelPanel front={front} summary={summary} />);expect(screen.getByText('Entrada manual')).not.toBeNull();expect(document.querySelectorAll('.funnel3d-row')).toHaveLength(crmStages(front).length);expect(within(document.querySelector('.funnel3d-row') as HTMLElement).getByText('7')).not.toBeNull();
 });
});
