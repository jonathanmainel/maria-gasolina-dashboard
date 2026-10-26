import { describe, expect, it } from "vitest";
import { defaultFunnel } from "./manual-funnel";
import { commercialPayload, commercialScope, decodeCommercialRows, validCommercialValues } from "./commercial-records";
describe("compatibilidade estrita com o payload homologado",()=>{
 it("recusa contagens fora da precisão inteira do navegador",()=>{expect(validCommercialValues("franchise","result",{contracts_closed:Number.MAX_SAFE_INTEGER+1,revenue:0})).toBe(false);});
 it("recusa campos comerciais e tempos desconhecidos",()=>{
  expect(validCommercialValues("franchise","result",{contracts_closed:1,revenue:0,other:10})).toBe(false);
  expect(validCommercialValues("franchise","snapshot",{...defaultFunnel.franchise,stage_days:{contract:1}})).toBe(false);
  expect(validCommercialValues("franchise","snapshot",{...defaultFunnel.franchise,stages:{...defaultFunnel.franchise.stages,other:1}})).toBe(false);
 });
 it("não lê snapshot com período ou envelope adicional",()=>{
  const range={start:"2026-10-01",end:"2026-10-23"};const command={front:"franchise" as const,kind:"snapshot" as const,range,values:defaultFunnel.franchise};const row={scope:commercialScope(command.front,command.kind,range),payload:commercialPayload(command),updated_at:"2026-10-23T12:00:00Z"};
  expect(decodeCommercialRows([{...row,payload:{...row.payload,period:range}}],range).franchise.snapshot).toBeNull();
  expect(decodeCommercialRows([{...row,payload:{...row.payload,extra:true}}],range).franchise.snapshot).toBeNull();
 });
});
