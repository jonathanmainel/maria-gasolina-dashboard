// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildCrmSummary } from "../lib/crm";
import { crmStageNames } from "../lib/crm-stages";
import { defaultFunnel, defaultResults } from "../lib/manual-funnel";
import type { DashboardData } from "../lib/use-dashboard";
import { CrmView } from "./Crm";

vi.mock("../lib/goals", () => ({ useGoals: () => ({ contracts_franchise: 6, contracts_condominium: 8 }) }));
vi.mock("../lib/manual-inputs", () => ({
  useManualData: () => ({ data: { funnel: defaultFunnel, results: defaultResults }, storage: "local", fallbackReason: undefined }),
  useSaveManualData: () => ({ mutateAsync: async () => undefined }),
}));

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  window.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

// Estoque real do kanban: "Contato" com 1962 cards e "Lead" com 9, "COF" com
// 194 e "Visita / Call" zerada, "Implantação" com 149 e "Contrato" vazio.
const funnel = {
  franchise: {
    stages: { lead: 9, contact: 1962, recall: 474, fqc: 72, visit_call: 0, cof: 194, pre_contract: 0, waiting: 0, contract: 0, implementation: 149 },
    stage_days: { lead: 2, contact: 5, recall: 4, fqc: 9, visit_call: 12, cof: 7, pre_contract: 3, waiting: 6, implementation: 45 },
    avg_ticket: 84500,
  },
  condominium: {
    stages: { lead: 3, contact: 798, recall: 9, fqa: 11, visit_proposal: 547, assembly: 13, contract: 0, implementation: 22 },
    stage_days: { lead: 4, contact: 6, recall: 5, fqa: 8, visit_proposal: 11, assembly: 20, implementation: 30 },
    avg_ticket: 0,
  },
};
const results = {
  franchise: { contracts_closed: 4, revenue: 338000 },
  condominium: { contracts_closed: 2, revenue: 0 },
};

const data = {
  crm: {
    franchise: buildCrmSummary("franchise", funnel.franchise, results.franchise, { rows: [] }),
    condominium: buildCrmSummary("condominium", funnel.condominium, results.condominium, { rows: [] }),
  },
} as unknown as DashboardData;

const funnelNames = () => [...document.querySelectorAll(".funnel3d-row-top strong")].map((node) => node.textContent);
const kpi = (label: string) =>
  [...document.querySelectorAll(".kpi")].find((node) => node.querySelector(".kpi-top p")?.textContent === label);

describe("tela de CRM com os funis reais", () => {
  it("mostra as 10 etapas de Franquias na ordem exata", () => {
    render(<CrmView data={data} readOnly />);
    expect(funnelNames()).toEqual(crmStageNames("franchise"));
  });

  it("mostra as 8 etapas de Condomínios ao trocar de frente", () => {
    render(<CrmView data={data} readOnly />);
    fireEvent.click(screen.getByRole("tab", { name: "Condomínios" }));
    expect(funnelNames()).toEqual(crmStageNames("condominium"));
  });

  it("marca Implantação como pós-venda depois do Contrato", () => {
    render(<CrmView data={data} readOnly />);
    const names = funnelNames();
    expect(names.indexOf("Implantação")).toBe(names.indexOf("Contrato") + 1);
    const row = document.querySelector(".funnel3d-row.post-sale");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("Implantação")).not.toBeNull();
    expect(within(row as HTMLElement).getByText("pós-venda")).not.toBeNull();
  });

  it("não exibe percentual nenhum nos nomes das etapas", () => {
    render(<CrmView data={data} readOnly />);
    funnelNames().forEach((name) => expect(name).not.toMatch(/%/));
  });

  it("não exibe nomes do modelo antigo em lugar nenhum da tela", () => {
    render(<CrmView data={data} readOnly />);
    ["Perfil validado", "Discovery Day", "Proposta / COF", "Contrato assinado", "Contato com síndico", "Visita técnica", "Aprovação em assembleia", "Loja contratada"]
      .forEach((retired) => expect(screen.queryByText(retired)).toBeNull());
  });

  it("a etapa mais demorada é comercial, não a Implantação de 45 dias", () => {
    render(<CrmView data={data} readOnly />);
    const slowest = [...document.querySelectorAll(".panel")].find((panel) => panel.textContent?.includes("Etapa mais demorada"));
    expect(slowest?.textContent).toContain("Visita / Call");
    expect(slowest?.textContent).not.toContain("Implantação");
    expect(slowest?.textContent).toContain("~12 dias");
  });

  it("a barra de ciclo não inclui a Implantação", () => {
    render(<CrmView data={data} readOnly />);
    expect(document.querySelector(".cycle-bar-legend")?.textContent).not.toContain("Implantação");
  });
});

describe("snapshot e resultado não se misturam na tela", () => {
  it("o card de contratos mostra o resultado informado, não a coluna Contrato", () => {
    render(<CrmView data={data} readOnly />);
    // A coluna "Contrato" está vazia; o período fechou 4.
    expect(kpi("Contratos no período")?.textContent).toContain("4");
    expect(data.crm.franchise.close_stage?.count).toBe(0);
  });

  it("o card de oportunidades abertas soma o estoque comercial", () => {
    render(<CrmView data={data} readOnly />);
    expect(kpi("Oportunidades abertas")?.textContent).toContain("2.711");
  });

  it("nenhuma linha do funil exibe taxa de passagem entre colunas vizinhas", () => {
    render(<CrmView data={data} readOnly />);
    const captions = [...document.querySelectorAll(".funnel3d-row-bottom em")].map((node) => node.textContent ?? "");
    captions.forEach((caption) => {
      expect(caption).not.toMatch(/seguiu/);
      expect(caption).not.toMatch(/saíram/);
    });
    // 1962 cards em "Contato" sobre 2711 abertos = 72% do pipeline aberto.
    expect(captions.some((caption) => caption.includes("% do pipeline aberto"))).toBe(true);
  });

  it("a tela não promete conversão, projeção nem origem de contrato", () => {
    render(<CrmView data={data} readOnly />);
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("Conversão lead");
    expect(text).not.toContain("Pipeline projetado");
    expect(text).not.toContain("Projetado (pipeline aberto)");
    expect(text).not.toContain("Origem dos contratos");
    expect(text).toContain("Origem dos leads de mídia");
  });

  it("o gráfico mensal não anuncia contratos nem receita inferidos", () => {
    render(<CrmView data={data} readOnly />);
    const chart = [...document.querySelectorAll(".panel")].find((panel) => panel.textContent?.includes("Leads de mídia mês a mês"));
    expect(chart).not.toBeUndefined();
    expect(chart?.textContent).not.toContain("Reuniões");
  });
});

describe("editor manual", () => {
  it("expõe uma caixa para cada etapa do kanban", () => {
    render(<CrmView data={data} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Editar dados/ })[0]);
    crmStageNames("franchise").forEach((name) => {
      expect(screen.getAllByLabelText(name).length).toBeGreaterThan(0);
    });
    expect(document.querySelectorAll('input[id^="manual-stage_"]')).toHaveLength(10);
  });

  it("tem um bloco separado para contratos fechados e receita do período", () => {
    render(<CrmView data={data} />);
    const panel = [...document.querySelectorAll(".panel")].find((node) => node.textContent?.includes("Resultado do período · Franquias"));
    expect(panel).not.toBeUndefined();
    fireEvent.click(within(panel as HTMLElement).getByRole("button", { name: /Editar dados/ }));
    expect(screen.getByLabelText("Contratos fechados no período")).not.toBeNull();
    expect(screen.getByLabelText("Receita do período")).not.toBeNull();
  });
});
