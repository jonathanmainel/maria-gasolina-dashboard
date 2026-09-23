import { describe, expect, it } from "vitest";
import { classifyFront } from "./api";

describe("atribuição de frente pelo nome da campanha", () => {
  it("reconhece as campanhas de franquias", () => {
    expect(classifyFront("MG | LEADS | CBO | FRANQUIA | FORMULÁRIO")).toBe("franchise");
    expect(classifyFront("mg | search | franqueados")).toBe("franchise");
  });

  it("reconhece as campanhas de condomínios, com ou sem acento", () => {
    expect(classifyFront("MG | LEADS | CONDOMÍNIOS | SÍNDICOS")).toBe("condominium");
    expect(classifyFront("MG | SEARCH | INDICACAO DE SINDICOS")).toBe("condominium");
  });

  it("devolve null quando o nome não segue o padrão, em vez de chutar uma frente", () => {
    expect(classifyFront("MG | INSTITUCIONAL | MARCA")).toBeNull();
    expect(classifyFront(null)).toBeNull();
    expect(classifyFront(undefined)).toBeNull();
  });
});
