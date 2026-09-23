import { describe, expect, it } from "vitest";
import { classifyFront } from "./api";

describe("atribuição de frente pelo nome da campanha", () => {
  it("reconhece as campanhas de franquias pelo radical FRANQ", () => {
    expect(classifyFront("MG | GOOGLE | FRANQ | SEARCH")).toBe("franchise");
    expect(classifyFront("mg | search | franq")).toBe("franchise");
    expect(classifyFront("MG | META | FRANQUIAS | LEADS")).toBe("franchise");
    expect(classifyFront("MG | LEADS | CBO | FRANQUIA | FORMULÁRIO")).toBe("franchise");
    expect(classifyFront("mg | search | franqueados")).toBe("franchise");
  });

  it("reconhece as campanhas de condomínios pelo radical CONDOM, com ou sem acento", () => {
    expect(classifyFront("MG | GOOGLE | CONDOM | SEARCH")).toBe("condominium");
    expect(classifyFront("CAPTAÇÃO CONDOMÍNIOS")).toBe("condominium");
    expect(classifyFront("mg | leads | condomínio")).toBe("condominium");
    expect(classifyFront("MG | SEARCH | CONDOMINIOS")).toBe("condominium");
  });

  it("classifica como franquias quando os dois radicais aparecem, pela ordem da regra", () => {
    expect(classifyFront("MG | FRANQ EM CONDOM")).toBe("franchise");
  });

  it("devolve null quando o nome não segue o padrão, em vez de chutar uma frente", () => {
    expect(classifyFront("MG | INSTITUCIONAL | MARCA")).toBeNull();
    expect(classifyFront(null)).toBeNull();
    expect(classifyFront(undefined)).toBeNull();
  });

  it("não classifica mais por termos fora dos radicais FRANQ e CONDOM", () => {
    expect(classifyFront("MG | SEARCH | INDICAÇÃO DE SÍNDICOS")).toBeNull();
    expect(classifyFront("MG | SEARCH | INDICACAO DE SINDICOS")).toBeNull();
    expect(classifyFront("MG | GOOGLE | FRANCHISE | SEARCH")).toBeNull();
  });
});
