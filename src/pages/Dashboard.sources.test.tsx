// @vitest-environment jsdom
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import type {PropsWithChildren} from 'react';
import {DashboardPage} from './Dashboard';
const mocks=vi.hoisted(()=>({dashboard:vi.fn(),settings:vi.fn(),organic:vi.fn(),global:vi.fn()}));
vi.mock('../components/Shell',()=>({Shell:({children}:PropsWithChildren)=><main>{children}</main>}));
vi.mock('../lib/supabase',()=>({supabase:null,isSupabaseConfigured:false}));
vi.mock('../lib/api',async original=>({...await original<typeof import('../lib/api')>(),getLastSync:vi.fn(async()=>null)}));
vi.mock('../lib/use-dashboard',async original=>({...await original<typeof import('../lib/use-dashboard')>(),useDashboard:mocks.dashboard}));
vi.mock('../views/Settings',()=>({SettingsView:({access}:{access:{canEdit:boolean}})=><section aria-label="Conteúdo de configurações">{access.canEdit?'Edição permitida':'Somente leitura'}</section>}));
vi.mock('../views/Organic',()=>({OrganicView:()=><section aria-label="Conteúdo orgânico">Orgânico independente</section>}));
const clients:QueryClient[]=[];
beforeEach(()=>{vi.clearAllMocks();mocks.settings.mockResolvedValue(undefined);mocks.organic.mockResolvedValue(undefined);});
afterEach(()=>{cleanup();clients.splice(0).forEach(c=>c.clear());});
function show(view:string,{own='success',share=false,canEdit=false}:{own?:'success'|'loading'|'error';share?:boolean;canEdit?:boolean}={}){
 const source=(retry:()=>void)=>({isLoading:own==='loading',isError:own==='error',error:own==='error'?new Error('Erro da fonte própria'):null,refetch:retry});
 mocks.dashboard.mockReturnValue({isLoading:true,isError:true,error:new Error('Mídia indisponível'),refetch:mocks.global,commercial:{access:{canEdit}},sourceStates:{settings:source(mocks.settings),organic:source(mocks.organic)}});
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});clients.push(client);
 render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/dashboard/maria-gasolina?view=${view}${share?'&share=1':''}`]}><DashboardPage/></MemoryRouter></QueryClientProvider>);
}
describe('view states follow their own sources',()=>{
 it.each([['settings','Conteúdo de configurações'],['organic','Conteúdo orgânico']])('keeps %s readable while unrelated media fails or loads',(view,label)=>{
  show(view);expect(screen.getByRole('region',{name:label})).not.toBeNull();expect(screen.queryByRole('alert')).toBeNull();
 });
 it.each([['settings','Carregando configurações'],['organic','Carregando dados orgânicos']])('hides values while the own %s source loads',(view,label)=>{
  show(view,{own:'loading'});expect(screen.getByRole('status',{name:label})).not.toBeNull();expect(screen.queryByRole('region')).toBeNull();
 });
 it.each([['settings','Não foi possível carregar as configurações'],['organic','Não foi possível carregar os dados orgânicos']])('reports and retries only the failed %s source',(view,title)=>{
  show(view,{own:'error'});expect(screen.getByRole('heading',{name:title})).not.toBeNull();expect(screen.queryByRole('region')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));expect(view==='settings'?mocks.settings:mocks.organic).toHaveBeenCalledTimes(1);expect(view==='settings'?mocks.organic:mocks.settings).not.toHaveBeenCalled();expect(mocks.global).not.toHaveBeenCalled();
 });
 it.each([false,true])('preserves canEdit=%s from the existing access result',canEdit=>{
  show('settings',{canEdit});expect(screen.getByText(canEdit?'Edição permitida':'Somente leitura')).not.toBeNull();
 });
 it('keeps Settings hidden in sharing even with an editable access result',()=>{
  show('settings',{share:true,canEdit:true});expect(screen.queryByRole('region',{name:'Conteúdo de configurações'})).toBeNull();
 });
 it('retains the global media error for the executive view',()=>{
  show('executive');expect(screen.getByRole('heading',{name:'Não foi possível carregar os dados'})).not.toBeNull();fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));expect(mocks.global).toHaveBeenCalledTimes(1);
 });
});
