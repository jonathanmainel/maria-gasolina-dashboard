import { describe, expect, it } from "vitest";
import { commercialDemoSummary } from "./commercial-demo";
import { defaultFunnel } from "./manual-funnel";
describe('view-only commercial examples',()=>{
  it('preserves exact snapshots separately from contracts and revenue',()=>{
    const c=commercialDemoSummary('condominium'),f=commercialDemoSummary('franchise');
    expect(c.stages.map(s=>s.count)).toEqual([15,42,18,14,11,6,2,9]);
    expect(f.stages.map(s=>s.count)).toEqual([24,68,31,22,14,11,7,4,3,18]);
    expect([c.contracts,c.revenue]).toEqual([6,108000]);expect([f.contracts,f.revenue]).toEqual([9,760500]);
    expect(c.monthly).toEqual([]);expect(f.sources).toEqual([]);
  });
  it('does not mutate shared defaults or operational records',()=>{
    const c=commercialDemoSummary('franchise');c.stages[0].count=999;
    expect(defaultFunnel.franchise.stages.lead).toBe(24);expect(commercialDemoSummary('franchise').stages[0].count).toBe(24);
  });
});
