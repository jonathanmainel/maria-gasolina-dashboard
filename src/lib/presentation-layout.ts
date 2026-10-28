import { rankCreatives, CREATIVE_RANKING_LIMIT } from "./creatives";
import { commercialFronts } from "./fronts";
import { crmStages } from "./crm-stages";
import type { Creative, CommercialFront } from "../types";

export type PresentationSlide = { id: string; kind: "executive" | "pacing" | "front" | "creatives" | "organic" | "organic-posts" | "crm"; front?: CommercialFront; offset?: number; count?: number };
export function presentationLayout(width: number, height: number) {
  return { creativeCount: width >= 1100 && height >= 650 ? 3 : width >= 700 ? 2 : 1,
    pacingCount: width < 700 ? (height >= 700 ? 3 : 2) : height >= 700 ? 5 : 4,
    scale: Math.max(.7, Math.min(2, width / 1500, height / 900)),
    // Bound the funnel's information density by its real available height.
    funnelCount: height >= 700 ? 5 : 3 };
}
export function presentationSlides(creatives: Creative[], width: number, height: number): PresentationSlide[] {
  const layout = presentationLayout(width, height);
  const slides: PresentationSlide[] = [{ id: "executive", kind: "executive" }];
  // Five existing executive indicators; only their visual pagination changes.
  for (let offset = 0; offset < 5; offset += layout.pacingCount) slides.push({ id: offset === 0 ? "executive-goals" : `executive-goals-${offset}`, kind: "pacing", offset, count: layout.pacingCount });
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

/** Keep the same content when a resize changes the number of items per page. */
export function presentationSlideIndex(slides: PresentationSlide[], active: PresentationSlide) {
  const exact = slides.findIndex(slide => slide.id === active.id);
  if (exact >= 0) return exact;
  const related = slides.findIndex(slide => slide.kind === active.kind && slide.front === active.front && (active.offset ?? 0) >= (slide.offset ?? 0) && (active.offset ?? 0) < (slide.offset ?? 0) + (slide.count ?? 1));
  return Math.max(0, related);
}
