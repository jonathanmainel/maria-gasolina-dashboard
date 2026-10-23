// @vitest-environment jsdom
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {SettingsView} from './Settings';
import {ManualNumbersPanel} from '../components/ui/editable';
import {resolveCommercialAccess} from '../lib/commercial-access';
import {demoGoals,demoDelivery} from '../data/demo';
const save=vi.hoisted(()=>vi.fn(async (_:unknown)=>undefined));
const manual={goals:demoGoals,delivery:demoDelivery,funnel:{franchise:null,condominium:null},results:{franchise:null,condominium:null}};
vi.mock('../lib/manual-inputs',()=>({useManualData:()=>({data:manual,storage:'supabase'}),useSaveManualData:()=>({mutateAsync:save})}));
vi.mock('../lib/api',()=>({CLIENT_SLUG:'maria-gasolina',isDemoMode:false}));
vi.mock('../lib/supabase',()=>({supabase:null}));
vi.mock('../components/NetworkUnitsPanel',()=>({NetworkUnitsPanel:()=> <div>Cadastro de unidades preservado<input type="file" aria-label="Planilha de unidades" /></div>}));
vi.mock('../theme',()=>({useTheme:()=>({theme:'dark',setTheme:()=>{}})}));
beforeAll(()=>{window.matchMedia ??= ((media:string)=>({media,matches:false,addEventListener(){},removeEventListener(){}})) as any;});
afterEach(()=>{cleanup();save.mockClear();});
const props={shareUrl:'http://localhost/?share=1',onPresent:()=>{}};
describe('permissoes de Metas e Configuracoes',()=>{
 it('viewer consulta valores e utilitarios sem controles de gravacao',()=>{
  render(<SettingsView {...props} access={resolveCommercialAccess('viewer',true)} />);
  expect(screen.getByText('Verba de mídia mensal')).not.toBeNull();
  expect(screen.queryByRole('button',{name:'Editar dados'})).toBeNull();
  expect(screen.getByLabelText('Planilha de unidades').matches(':disabled')).toBe(true);
  expect(screen.getByText('Seu perfil permite somente leitura de metas e configurações.')).not.toBeNull();
  expect(screen.getByRole('button',{name:'Claro'})).not.toBeNull();expect(save).not.toHaveBeenCalled();
 });
 it.each(['viewer','editor','admin'] as const)('%s permanece bloqueado antes da liberacao',role=>{
  render(<SettingsView {...props} access={resolveCommercialAccess(role,false)} />);
  expect(screen.queryByRole('button',{name:'Editar dados'})).toBeNull();
  expect(screen.getByText('Edição de metas e configurações bloqueada até a liberação das permissões operacionais.')).not.toBeNull();
  expect(screen.getByLabelText('Planilha de unidades').matches(':disabled')).toBe(true);
 });
 it('permissao ainda desconhecida falha em modo somente leitura',()=>{
  render(<SettingsView {...props} />);expect(screen.queryByRole('button',{name:'Editar dados'})).toBeNull();
 });
 it.each(['editor','admin'] as const)('%s pode editar e enviar metas quando liberado',async role=>{
  render(<SettingsView {...props} access={resolveCommercialAccess(role,true)} />);
  expect(screen.getAllByRole('button',{name:'Editar dados'})).toHaveLength(2);
  expect(screen.getByLabelText('Planilha de unidades').matches(':disabled')).toBe(false);
  fireEvent.click(screen.getAllByRole('button',{name:'Editar dados'})[0]);
  fireEvent.change(screen.getByLabelText('Verba de mídia mensal'),{target:{value:'12345'}});
  fireEvent.click(screen.getByRole('button',{name:'Salvar metas'}));
  await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({goals:expect.objectContaining({media_budget:12345}),delivery:manual.delivery})));
 });
 it('revogacao fecha rascunho e impede envio sem apagar o valor exibido',()=>{
  const onSave=vi.fn(async()=>undefined);const fields=[{key:'budget',label:'Verba',kind:'currency' as const}];
  const {rerender}=render(<ManualNumbersPanel title='Meta' fields={fields} values={{budget:500}} onSave={onSave} />);
  fireEvent.click(screen.getByRole('button',{name:'Editar dados'}));fireEvent.change(screen.getByLabelText('Verba'),{target:{value:'999'}});
  rerender(<ManualNumbersPanel title='Meta' fields={fields} values={{budget:500}} onSave={onSave} readOnly />);
  expect(screen.queryByRole('spinbutton')).toBeNull();expect(screen.queryByRole('button',{name:'Salvar'})).toBeNull();
  expect(screen.getByText(/500,00/)).not.toBeNull();expect(onSave).not.toHaveBeenCalled();
 });
});
