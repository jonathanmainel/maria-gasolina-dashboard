// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({demo:false,role:'viewer',user:true,error:false}));
const filters=vi.hoisted(()=>[] as unknown[][]);
vi.mock('./api',()=>({CLIENT_SLUG:'maria-gasolina',get isDemoMode(){return state.demo;}}));
vi.mock('./supabase',()=>({supabase:{auth:{getUser:async()=>({data:{user:state.user?{id:'test-user'}:null},error:null})},from:(table:string)=>{
 const chain={select:()=>chain,eq:(key:string,value:unknown)=>{filters.push([table,key,value]);return chain;},maybeSingle:async()=>({data:table==='dashboard_clients'?{id:1}:{role:state.role},error:state.error?new Error('consulta recusada'):null})};return chain;
}}}));
import { COMMERCIAL_ACCESS_POLICY_READY, loadCommercialAccess, resolveCommercialAccess } from './commercial-access';
beforeEach(()=>{state.demo=false;state.role='viewer';state.user=true;state.error=false;filters.length=0;});
describe('autorização comercial carregada do vínculo correto',()=>{
 it.each(['viewer','editor','admin'])('%s respeita o vínculo atual com o gate liberado',async role=>{
  state.role=role;const access=await loadCommercialAccess();expect(COMMERCIAL_ACCESS_POLICY_READY).toBe(true);expect(access.role).toBe(role);expect(access.canEdit).toBe(role!=='viewer');expect(access.canManage).toBe(role==='admin');
  expect(filters).toContainEqual(['dashboard_clients','slug','maria-gasolina']);expect(filters).toContainEqual(['dashboard_client_users','client_id',1]);expect(filters).toContainEqual(['dashboard_client_users','user_id','test-user']);
 });
 it('sem usuário validado não consulta papéis nem autoriza',async()=>{state.user=false;expect((await loadCommercialAccess()).canEdit).toBe(false);expect(filters).toEqual([]);});
 it('falha de consulta não concede acesso',async()=>{state.error=true;await expect(loadCommercialAccess()).rejects.toThrow('consulta recusada');});
 it('recarrega o papel do vínculo a cada chamada sem confiar em papel anterior',async()=>{
  expect((await loadCommercialAccess()).canEdit).toBe(false);
  state.role='admin';expect((await loadCommercialAccess()).canManage).toBe(true);
  state.role='viewer';const access=await loadCommercialAccess();expect(access.canEdit).toBe(false);expect(access.canManage).toBe(false);
 });
 it('demo autoriza somente o caminho demonstrativo sem consultar o banco',async()=>{state.demo=true;expect((await loadCommercialAccess()).canEdit).toBe(true);expect(filters).toEqual([]);});
});

describe("contrato de papéis homologado",()=>{
 it.each(["viewer","editor","admin"] as const)("%s respeita a matriz quando liberado",role=>{
   expect(resolveCommercialAccess(role,true).canEdit).toBe(role!=="viewer");
   expect(resolveCommercialAccess(role,true).canManage).toBe(role==="admin");
 });
 it("manager legado não é promovido nem reconhecido como editor",async()=>{
   state.role="manager";const access=await loadCommercialAccess();expect(access.role).toBeNull();expect(access.canEdit).toBe(false);
 });
});
