import { Building2, BriefcaseBusiness, Dumbbell, Hospital, Rocket, type LucideIcon } from "lucide-react";
import type { CommercialFront, Front, PendingFront } from "../types";

export type CommercialCategory = "place" | "expansion";

interface FrontDefinition {
  id: CommercialFront;
  view: CommercialFront;
  category: CommercialCategory;
  order: number;
  icon: LucideIcon;
  dataAvailability: "connected" | "unavailable";
  label: string;
  short: string;
  accent: "red" | "gold";
  color: string;
  description: string;
  leadWord: string;
  title: string;
  emphasis?: string;
  introduction: string;
}

// Configuração de navegação e apresentação. Não classifica campanhas, não cria
// métricas/funis e não habilita fontes para as frentes ainda sem dados.
export const commercialFronts: Record<CommercialFront, FrontDefinition> = {
  condominium: {
    id: "condominium", view: "condominium", category: "place", order: 1, icon: Building2,
    dataAvailability: "connected", label: "Captação de condomínios", short: "Condomínios",
    accent: "gold", color: "var(--gold)", description: "Tráfego pago para captar indicações de síndicos e condomínios", leadWord: "indicações",
    title: "Indicações de condomínios,", emphasis: "do síndico à loja",
    introduction: "Campanhas para síndicos, administradoras e moradores das capitais prioritárias. Resultado abaixo é indicação registrada no formulário com UTM.",
  },
  company: {
    id: "company", view: "company", category: "place", order: 2, icon: BriefcaseBusiness,
    dataAvailability: "unavailable", label: "Empresas", short: "Empresas", accent: "gold", color: "var(--gold)",
    description: "Place · Empresas", leadWord: "leads", title: "Empresas",
    introduction: "Os indicadores serão exibidos quando houver dados associados.",
  },
  gym: {
    id: "gym", view: "gym", category: "place", order: 3, icon: Dumbbell,
    dataAvailability: "unavailable", label: "Academias", short: "Academias", accent: "gold", color: "var(--gold)",
    description: "Place · Academias", leadWord: "leads", title: "Academias",
    introduction: "Os indicadores serão exibidos quando houver dados associados.",
  },
  hospital: {
    id: "hospital", view: "hospital", category: "place", order: 4, icon: Hospital,
    dataAvailability: "unavailable", label: "Hospitais", short: "Hospitais", accent: "gold", color: "var(--gold)",
    description: "Place · Hospitais", leadWord: "leads", title: "Hospitais",
    introduction: "Os indicadores serão exibidos quando houver dados associados.",
  },
  franchise: {
    id: "franchise", view: "franchise", category: "expansion", order: 1, icon: Rocket,
    dataAvailability: "connected", label: "Expansão de franquias", short: "Franquias",
    accent: "red", color: "var(--red)", description: "Tráfego pago para captar candidatos a franqueado", leadWord: "candidatos",
    title: "Candidatos a franqueado,", emphasis: "do clique ao contrato",
    introduction: "Meta Ads e Google Ads trabalhando os 6 avatares e o lookalike de condomínios mapeados. Resultado abaixo é lead registrado no formulário com UTM.",
  },
};

export const commercialCategories = [
  { id: "place", label: "Place", icon: Building2 },
  { id: "expansion", label: "Expansão", icon: Rocket },
] as const;

export function isCommercialFront(value: string | null): value is CommercialFront {
  return value != null && Object.hasOwn(commercialFronts, value);
}

export function isPendingFront(value: string | null): value is PendingFront {
  return isCommercialFront(value) && commercialFronts[value].dataAvailability === "unavailable";
}

export function frontsForCategory(category: CommercialCategory): FrontDefinition[] {
  return Object.values(commercialFronts).filter((front) => front.category === category).sort((a, b) => a.order - b.order);
}

// Mantém a API consumida por metas, CRM, gráficos e apresentação, sem ampliar
// seus contratos de dados para frentes que ainda não possuem uma fonte.
export const frontMeta: Record<Front, FrontDefinition> = {
  franchise: commercialFronts.franchise,
  condominium: commercialFronts.condominium,
};

export type PlaceFront = Exclude<CommercialFront, "franchise">;

export function isPlaceFront(value: string): value is PlaceFront {
  return isCommercialFront(value) && commercialFronts[value].category === "place";
}

export const placeFrontIds = frontsForCategory("place").map((front) => front.id).filter(isPlaceFront);
