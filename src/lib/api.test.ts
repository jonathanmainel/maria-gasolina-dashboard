import { describe, expect, it } from "vitest";
import { classifyFront } from "./api";

describe("atribuição de frente pelo nome da campanha", () => {
  it("reconhece as campanhas de franquias pelo radical FRANQ", () => {
    expect(classifyFront("FRANQ")).toBe("franchise");
    expect(classifyFront("FRANQUEADOS")).toBe("franchise");
    expect(classifyFront("MG | GOOGLE | FRANQ | SEARCH")).toBe("franchise");
    expect(classifyFront("mg | search | franq")).toBe("franchise");
    expect(classifyFront("MG | META | FRANQUIAS | LEADS")).toBe("franchise");
    expect(classifyFront("MG | LEADS | CBO | FRANQUIA | FORMULÁRIO")).toBe("franchise");
    expect(classifyFront("mg | search | franqueados")).toBe("franchise");
  });

  it("reconhece as campanhas de condomínios pelo radical COND, abreviado ou por extenso", () => {
    // Campanha real 24027545468: abreviada como "COND", sem o "OM".
    expect(classifyFront("GT+ | SEARCH | MAX.CLIQUES - COND")).toBe("condominium");
    expect(classifyFront("COND")).toBe("condominium");
    expect(classifyFront("CONDOM")).toBe("condominium");
    expect(classifyFront("CONDOMÍNIOS")).toBe("condominium");
    expect(classifyFront("CAPTAÇÃO CONDOMÍNIOS")).toBe("condominium");
    expect(classifyFront("mg | leads | condomínio")).toBe("condominium");
    expect(classifyFront("MG | SEARCH | CONDOMINIOS")).toBe("condominium");
    expect(classifyFront("gt+ | search | max.cliques - cond")).toBe("condominium");
  });

  it("classifica como franquias quando os dois radicais aparecem, pela ordem da regra", () => {
    expect(classifyFront("MG | FRANQ EM COND")).toBe("franchise");
  });

  it("devolve null quando o nome não segue o padrão, em vez de chutar uma frente", () => {
    expect(classifyFront("MG | INSTITUCIONAL | MARCA")).toBeNull();
    expect(classifyFront("MG | SEARCH | MARCA | MARIA GASOLINA")).toBeNull();
    expect(classifyFront(null)).toBeNull();
    expect(classifyFront(undefined)).toBeNull();
  });

  it("não classifica mais por termos fora dos radicais FRANQ e COND", () => {
    expect(classifyFront("SÍNDICOS")).toBeNull();
    expect(classifyFront("MG | SEARCH | INDICAÇÃO DE SÍNDICOS")).toBeNull();
    expect(classifyFront("MG | SEARCH | INDICACAO DE SINDICOS")).toBeNull();
    expect(classifyFront("MG | GOOGLE | FRANCHISE | SEARCH")).toBeNull();
  });
});
