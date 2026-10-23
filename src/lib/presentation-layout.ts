import { rankCreatives, CREATIVE_RANKING_LIMIT } from "./creatives";
import { commercialFronts } from "./fronts";
import { crmStages } from "./crm-stages";
import type { Creative, CommercialFront } from "../types";

export type PresentationSlide = { id: string; kind: "executive" | "pacing" | "front" | "creatives" | "organic" | "organic-posts" | "crm"; front?: CommercialFront; offset?: number; count?: number };
export function presentationLayout(width: number, height: number) {
  return { creativeCount: width >= 1100 && height >= 650 ? 3 : width >= 700 ? 2 : 1,
    scale: Math.max(.7, Math.min(2, width / 1500, height / 900)),
    // Bound the funnel's information density by its real available height.
    funnelCount: height >= 700 ? 5 : 3 };
}
export function presentationSlides(creatives: Creative[], width: number, height: number): PresentationSlide[] {
  const layout = presentationLayout(width, height);
  const slides: PresentationSlide[] = [{ id: "executive", kind: "executive" }, { id: "executive-goals", kind: "pacing" }];
  for (const front of ["franchise", "condominium"] as const) {
    slides.push({ id: front, kind: "front", front });
    const count = Math.min(CREATIVE_RANKING_LIMIT, rankCreatives(creatives, front).length);
    for (let offset = 0; offset < count; offset += layout.creativeCount) slides.push({ id: `${front}-creatives-${offset}`, kind: "creatives", front, offset, count: layout.creativeCount });
    const stages = crmStages(front).length;
    for (let offset = 0; offset < stages; offset += layout.funnelCount) slides.push({ id: `${front}-crm-${offset}`, kind: "crm", front, offset, count: layout.funnelCount });
  }
  for (const { id: front } of Object.values(commercialFronts).filter(item => item.id !== "franchise" && item.id !== "condominium")) {
    for (let offset = 0; offset < crmStages(front).length; offset += layout.funnelCount) slides.push({ id: `${front}-crm-${offset}`, kind: "crm", front, offset, count: layout.funnelCount });
  }
  slides.push({ id: "organic", kind: "organic" }, { id: "organic-posts", kind: "organic-posts" });
  return slides;
}
