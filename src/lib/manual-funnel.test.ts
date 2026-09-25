import { describe, expect, it } from "vitest";
// `?raw` do Vite: lê o snippet sem precisar dos tipos de node no tsconfig.
import seedSql from "../../supabase/snippets/seed_crm_manual_inputs.sql?raw";
import { crmStages } from "./crm-stages";
import { defaultFunnel, defaultResults, legacyStageMap, normalizeFunnel, normalizeResults } from "./manual-funnel";
import { normalize } from "./manual-inputs";

// O payload já salvo em `dashboard_manual_inputs` guarda o funil no modelo
// antigo de 6 etapas, como dois arrays posicionais. Ele precisa continuar
// carregando, mapeado de forma conservadora e sem inventar volume para as
// etapas do CRM real que nunca foram medidas.

const legacyFranchise = { stages: [420, 260, 130, 67, 36, 18], stage_days: [3, 6, 9, 12, 17], avg_ticket: 84500 };
const legacyCondominium = { stages: [180, 126, 79, 49, 27, 16], stage_days: [5, 9, 12, 16, 20], avg_ticket: 0 };

describe("migração do payload legado de 6 etapas", () => {
  it("Franquias: Leads → Lead e Contato realizado → Contato", () => {
    const funnel = normalizeFunnel("franchise", legacyFranchise);
    expect(funnel.stages.lead).toBe(420);
    expect(funnel.stages.contact).toBe(260);
  });

  it("\"Contrato assinado\" vai para o resultado do período, não para a coluna Contrato", () => {
    // No modelo antigo a última posição era contagem de FECHAMENTO. A coluna
    // "Contrato" do kanban (cards parados nela agora) não era medida.
    expect(normalizeFunnel("franchise", legacyFranchise).stages.contract).toBe(0);
    expect(normalizeResults("franchise", undefined, legacyFranchise).contracts_closed).toBe(18);
    expect(normalizeFunnel("condominium", legacyCondominium).stages.contract).toBe(0);
    expect(normalizeResults("condominium", undefined, legacyCondominium).contracts_closed).toBe(16);
  });

  it("a receita do período nunca é reconstruída a partir de contratos × ticket", () => {
    expect(normalizeResults("franchise", undefined, legacyFranchise).revenue).toBe(0);
  });

  it("Franquias: etapas antigas sem equivalência clara entram em 0, não em um palpite", () => {
    const funnel = normalizeFunnel("franchise", legacyFranchise);
    // "Perfil validado" (130), "Discovery Day" (67) e "Proposta / COF" (36) não
    // têm par seguro entre Recall/FQC/Visita/COF/Pré-contrato/Espera.
    ["recall", "fqc", "visit_call", "cof", "pre_contract", "waiting", "implementation"].forEach((id) => {
      expect(funnel.stages[id]).toBe(0);
    });
  });

  it("Condomínios: Indicações, Contato com síndico e Aprovação em assembleia são mapeados", () => {
    const funnel = normalizeFunnel("condominium", legacyCondominium);
    expect(funnel.stages.lead).toBe(180);
    expect(funnel.stages.contact).toBe(126);
    expect(funnel.stages.assembly).toBe(49);
    // "Visita técnica" (79) e "Proposta" (27) cairiam ambos em "Visita / Proposta".
    expect(funnel.stages.recall).toBe(0);
    expect(funnel.stages.fqa).toBe(0);
    expect(funnel.stages.visit_proposal).toBe(0);
    expect(funnel.stages.implementation).toBe(0);
  });

  it("os tempos seguem exatamente o mesmo mapa dos volumes", () => {
    expect(normalizeFunnel("franchise", legacyFranchise).stage_days).toMatchObject({ lead: 3, contact: 6, recall: 0, fqc: 0 });
    expect(normalizeFunnel("condominium", legacyCondominium).stage_days).toMatchObject({ lead: 5, contact: 9, assembly: 16, fqa: 0 });
  });

  it("o ticket médio do payload antigo é preservado", () => {
    expect(normalizeFunnel("franchise", legacyFranchise).avg_ticket).toBe(84500);
    expect(normalizeFunnel("condominium", legacyCondominium).avg_ticket).toBe(0);
  });

  it("todo índice legado mapeado aparece no resultado — nenhuma perda silenciosa", () => {
    (["franchise", "condominium"] as const).forEach((front) => {
      const legacy = front === "franchise" ? legacyFranchise : legacyCondominium;
      const funnel = normalizeFunnel(front, legacy);
      Object.entries(legacyStageMap[front]).forEach(([index, id]) => {
        expect(funnel.stages[id]).toBe(legacy.stages[Number(index)]);
      });
    });
  });

  it("o resultado tem exatamente as chaves das etapas atuais da frente", () => {
    (["franchise", "condominium"] as const).forEach((front) => {
      const funnel = normalizeFunnel(front, front === "franchise" ? legacyFranchise : legacyCondominium);
      expect(Object.keys(funnel.stages).sort()).toEqual(crmStages(front).map((stage) => stage.id).sort());
      expect(Object.keys(funnel.stage_days).sort()).toEqual(
        crmStages(front).filter((stage) => stage.tracksDays).map((stage) => stage.id).sort(),
      );
    });
  });
});

describe("payload no formato atual (registro por id)", () => {
  it("valores por id passam inteiros e são travados em zero quando negativos", () => {
    const funnel = normalizeFunnel("franchise", {
      stages: { lead: 500, contact: 300, recall: 210, fqc: 150, visit_call: 110, cof: 80, pre_contract: 50, waiting: 33, contract: 21, implementation: 14 },
      stage_days: { lead: 2, contact: -5, implementation: 30 },
      avg_ticket: 90000,
    });
    expect(funnel.stages.waiting).toBe(33);
    expect(funnel.stages.implementation).toBe(14);
    expect(funnel.stage_days.contact).toBe(0);
    expect(funnel.stage_days.implementation).toBe(30);
    expect(funnel.avg_ticket).toBe(90000);
  });

  it("etapa ausente do payload entra em 0, nunca no número ilustrativo do padrão", () => {
    const funnel = normalizeFunnel("franchise", { stages: { lead: 10, contract: 1 }, stage_days: {}, avg_ticket: 1000 });
    expect(funnel.stages.contact).toBe(0);
    expect(funnel.stages.contact).not.toBe(defaultFunnel.franchise.stages.contact);
  });

  it("chaves desconhecidas (etapa removida do modelo) são descartadas", () => {
    const funnel = normalizeFunnel("condominium", { stages: { lead: 10, discovery_day: 99 }, stage_days: {}, avg_ticket: 0 });
    expect(funnel.stages).not.toHaveProperty("discovery_day");
  });

  it("payload ausente devolve o padrão da frente", () => {
    expect(normalizeFunnel("franchise", undefined)).toEqual(defaultFunnel.franchise);
    expect(normalizeFunnel("condominium", {})).toEqual(defaultFunnel.condominium);
  });
});

describe("normalize() do bloco manual inteiro", () => {
  it("um payload salvo com o modelo antigo continua carregando, em dois blocos", () => {
    const result = normalize({ funnel: { franchise: legacyFranchise, condominium: legacyCondominium } });
    expect(result.funnel.condominium.stages.assembly).toBe(49);
    expect(result.results.franchise.contracts_closed).toBe(18);
    expect(result.results.condominium.contracts_closed).toBe(16);
    expect(result.goals).toBeDefined();
    expect(result.delivery).toBeDefined();
  });

  it("um payload já no formato novo não passa pela migração do legado", () => {
    const result = normalize({
      funnel: { franchise: { stages: { lead: 9, contact: 1962, contract: 0 }, stage_days: {}, avg_ticket: 84500 } },
      results: { franchise: { contracts_closed: 4, revenue: 338000 } },
    });
    expect(result.funnel.franchise.stages.contact).toBe(1962);
    expect(result.funnel.franchise.stages.contract).toBe(0);
    expect(result.results.franchise).toEqual({ contracts_closed: 4, revenue: 338000 });
  });

  it("o padrão de resultado é o seed manual de apresentação, independente do snapshot", () => {
    expect(defaultResults.franchise).toEqual({ contracts_closed: 9, revenue: 760500 });
    expect(defaultResults.condominium).toEqual({ contracts_closed: 6, revenue: 108000 });
    expect(normalize({}).results).toEqual(defaultResults);
    // 9 fechamentos no período com só 3 cards parados na coluna "Contrato" e 18
    // em "Implantação": nenhum dos dois números sai do outro.
    expect(defaultResults.franchise.contracts_closed).not.toBe(defaultFunnel.franchise.stages.contract);
    expect(defaultResults.franchise.contracts_closed).not.toBe(defaultFunnel.franchise.stages.implementation);
  });

  it("o seed do código bate com o snippet de seed do Supabase", () => {
    // O snippet é operação manual e não roda em teste, mas os dois não podem
    // divergir: quem mudar um lado tem que mudar o outro.
    Object.entries(defaultFunnel.franchise.stages).forEach(([id, value]) => {
      expect(seedSql).toContain(`'${id}', ${value}`);
    });
    Object.entries(defaultFunnel.condominium.stages).forEach(([id, value]) => {
      expect(seedSql).toContain(`'${id}', ${value}`);
    });
    expect(seedSql).toContain("'contracts_closed', 9, 'revenue', 760500");
    expect(seedSql).toContain("'contracts_closed', 6, 'revenue', 108000");
    expect(seedSql).toContain("'avg_ticket', 84500");
    // O merge tem que ser raso e só nas duas chaves de CRM.
    expect(seedSql).toContain("payload = m.payload || jsonb_build_object(");
    expect(seedSql).not.toMatch(/payload\s*=\s*jsonb_build_object\(/);
  });

  it("o snapshot padrão traz as 10 e as 8 etapas preenchidas", () => {
    expect(defaultFunnel.franchise.stages).toEqual({
      lead: 24, contact: 68, recall: 31, fqc: 22, visit_call: 14,
      cof: 11, pre_contract: 7, waiting: 4, contract: 3, implementation: 18,
    });
    expect(defaultFunnel.condominium.stages).toEqual({
      lead: 15, contact: 42, recall: 18, fqa: 14,
      visit_proposal: 11, assembly: 6, contract: 2, implementation: 9,
    });
    expect(defaultFunnel.franchise.avg_ticket).toBe(84500);
    expect(defaultFunnel.condominium.avg_ticket).toBe(0);
  });

  it("o snapshot padrão é um estoque de kanban, não uma curva de funil", () => {
    // Trava contra a volta do modelo cumulativo: "Contato" tem muito mais
    // cards que "Lead", e "Implantação" tem mais que "Contrato".
    expect(defaultFunnel.franchise.stages.contact).toBeGreaterThan(defaultFunnel.franchise.stages.lead);
    expect(defaultFunnel.franchise.stages.implementation).toBeGreaterThan(defaultFunnel.franchise.stages.contract);
    expect(defaultFunnel.condominium.stages.contact).toBeGreaterThan(defaultFunnel.condominium.stages.lead);
  });
});

describe("normalizeResults()", () => {
  it("payload no formato atual passa inteiro e trava negativos", () => {
    expect(normalizeResults("franchise", { contracts_closed: 4, revenue: 338000 })).toEqual({ contracts_closed: 4, revenue: 338000 });
    expect(normalizeResults("franchise", { contracts_closed: -4, revenue: -1 })).toEqual({ contracts_closed: 0, revenue: 0 });
  });

  it("um dos dois campos presente não faz o outro cair no legado nem no padrão", () => {
    expect(normalizeResults("franchise", { revenue: 100 }, legacyFranchise)).toEqual({ contracts_closed: 0, revenue: 100 });
  });

  it("sem resultado e sem legado em array, devolve o padrão da frente", () => {
    expect(normalizeResults("franchise", undefined, { stages: { lead: 9 } })).toEqual(defaultResults.franchise);
    expect(normalizeResults("condominium", undefined, undefined)).toEqual(defaultResults.condominium);
  });

  it("um resultado salvo em zero continua zero: o seed não ressuscita por cima", () => {
    // Zero informado é um resultado legítimo do período ("não fechamos nada"),
    // e não pode ser confundido com ausência de dado.
    expect(normalizeResults("franchise", { contracts_closed: 0, revenue: 0 })).toEqual({ contracts_closed: 0, revenue: 0 });
    expect(normalizeResults("franchise", { contracts_closed: 0 })).toEqual({ contracts_closed: 0, revenue: 0 });
  });
});
