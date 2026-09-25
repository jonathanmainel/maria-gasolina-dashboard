// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildCrmSummary } from "../lib/crm";
import { crmStageNames } from "../lib/crm-stages";
import { defaultFunnel } from "../lib/manual-funnel";
import type { DashboardData } from "../lib/use-dashboard";
import { CrmView } from "./Crm";

vi.mock("../lib/goals", () => ({ useGoals: () => ({ contracts_franchise: 6, contracts_condominium: 8 }) }));
vi.mock("../lib/manual-inputs", () => ({
  useManualData: () => ({ data: { funnel: defaultFunnel }, storage: "local", fallbackReason: undefined }),
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

const funnel = {
  franchise: {
    stages: { lead: 400, contact: 240, recall: 180, fqc: 120, visit_call: 90, cof: 60, pre_contract: 40, waiting: 30, contract: 20, implementation: 12 },
    stage_days: { lead: 3, contact: 6, recall: 4, fqc: 9, visit_call: 12, cof: 5, pre_contract: 3, waiting: 5, implementation: 40 },
    avg_ticket: 80000,
  },
  condominium: {
    stages: { lead: 200, contact: 140, recall: 100, fqa: 70, visit_proposal: 50, assembly: 30, contract: 14, implementation: 9 },
    stage_days: { lead: 5, contact: 9, recall: 6, fqa: 8, visit_proposal: 10, assembly: 16, implementation: 25 },
    avg_ticket: 0,
  },
};

const data = {
  crm: {
    franchise: buildCrmSummary("franchise", funnel.franchise, { rows: [] }),
    condominium: buildCrmSummary("condominium", funnel.condominium, { rows: [] }),
  },
} as unknown as DashboardData;

const funnelNames = () =>
  [...document.querySelectorAll(".funnel3d-row-top strong")].map((node) => node.textContent);

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

  it("a etapa mais demorada é comercial, não a Implantação de 40 dias", () => {
    render(<CrmView data={data} readOnly />);
    // "Visita / Call" tem 12 dias; "Implantação" tem 40 e é pós-venda.
    const slowest = [...document.querySelectorAll(".panel")].find((panel) => panel.textContent?.includes("Etapa mais demorada"));
    expect(slowest?.textContent).toContain("Visita / Call");
    expect(slowest?.textContent).not.toContain("Implantação");
    expect(slowest?.textContent).toContain("~12 dias");
  });

  it("a barra de ciclo não inclui a Implantação", () => {
    render(<CrmView data={data} readOnly />);
    const legend = document.querySelector(".cycle-bar-legend");
    expect(legend?.textContent).not.toContain("Implantação");
  });

  it("o editor manual expõe uma caixa para cada etapa das duas frentes", () => {
    render(<CrmView data={data} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Editar dados/ })[0]);
    crmStageNames("franchise").forEach((name) => {
      expect(screen.getAllByLabelText(name).length).toBeGreaterThan(0);
    });
    expect(document.querySelectorAll('input[id^="manual-stage_"]')).toHaveLength(10);
  });
});
