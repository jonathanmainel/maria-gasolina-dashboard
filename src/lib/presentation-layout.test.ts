import { describe, expect, it } from "vitest";
import { presentationLayout, presentationSlides, presentationSlideIndex } from "./presentation-layout";
import type { Creative } from "../types";
import { commercialFronts } from "./fronts";
import { crmStages } from "./crm-stages";
describe('viewport presentation pagination',()=>{
  it.each([[1920,1080,1],[1024,768,1],[390,844,2],[360,800,2],[960,600,2],[360,600,3]])('represents all five executive goals once in %sx%s across %s pages',(w,h,pages)=>{
    const goals=presentationSlides([],w,h).filter(slide=>slide.kind==='pacing');
    expect(goals).toHaveLength(pages);
    expect(goals.flatMap(page=>[0,1,2,3,4].slice(page.offset!,page.offset!+page.count!))).toEqual([0,1,2,3,4]);
  });
  it('keeps the active goal or creative visible when pages regroup after resize',()=>{
    const creatives=Array.from({length:9},(_,i)=>({id:String(i),front:'franchise',channel:'meta_ads',leads:9-i}) as Creative);
    const mobile=presentationSlides(creatives,360,800), desktop=presentationSlides(creatives,1920,1080);
    for(const active of mobile.filter(s=>s.kind==='pacing'||s.kind==='creatives')){
      const target=desktop[presentationSlideIndex(desktop,active)];
      expect(target.kind).toBe(active.kind);expect(target.front).toBe(active.front);
      expect(target.offset).toBeLessThanOrEqual(active.offset!);
      expect(target.offset!+target.count!).toBeGreaterThan(active.offset!);
    }
    const active=desktop.find(s=>s.id==='condominium')!;
    expect(mobile[presentationSlideIndex(mobile,active)].id).toBe('condominium');
  });
  it('deriva as cinco frentes e todas as etapas do registro e dos dois modelos compartilhados',()=>{
    const slides=presentationSlides([],1366,768);
    for(const {id} of Object.values(commercialFronts)) {
      const pages=slides.filter(slide=>slide.kind==='crm'&&slide.front===id);
      expect(pages.length).toBeGreaterThan(0);
      const represented=pages.flatMap(page=>crmStages(id).slice(page.offset!,page.offset!+page.count!).map(stage=>stage.id));
      expect(represented).toEqual(crmStages(id).map(stage=>stage.id));
    }
  });
  it.each([[1366,768],[1440,900],[1920,1080],[2560,1440],[3840,2160],[3440,1440]])('uses dedicated creative pages in %sx%s',(w,h)=>{
    expect(presentationLayout(w,h).creativeCount).toBe(3);
  });
  it('splits all pipeline stages in short effective viewports',()=>{
    const slides=presentationSlides([],1092,614);
    expect(slides.filter(s=>s.kind==='crm'&&s.front==='franchise').map(s=>s.offset)).toEqual([0,3,6,9]);
    expect(slides.filter(s=>s.kind==='crm'&&s.front==='condominium').map(s=>s.offset)).toEqual([0,3,6]);
  });
  it('preserves Meta ranking and exposes all selected creatives exactly once',()=>{
    const creatives=Array.from({length:9},(_,i)=>({id:String(i),front:'franchise',channel:'meta_ads',leads:9-i}) as Creative);
    const pages=presentationSlides(creatives,1366,768).filter(s=>s.kind==='creatives');
    expect(pages.map(p=>[p.offset,p.count])).toEqual([[0,3],[3,3],[6,3]]);
    expect(presentationSlides(creatives,800,600).filter(s=>s.kind==='creatives')).toHaveLength(5);
  });
});
