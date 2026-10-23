// @vitest-environment jsdom
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({reload:vi.fn(),demo:false}));
vi.mock("../lib/api",()=>({get isDemoMode(){return mocks.demo;}}));
vi.mock("../lib/data-refresh",()=>({reloadDashboardData:mocks.reload,getSourceFreshness:async()=>[{source:"meta_ads",completedAt:"2026-10-23T04:00:00Z",latestDate:"2026-10-22"},{source:"google_ads",completedAt:"2026-09-28T04:00:00Z",latestDate:"2026-09-27"},{source:"ga4",completedAt:"2026-10-23T04:00:00Z",latestDate:"2026-10-22"}]}));
import {DataRefreshPanel} from "./DataRefreshPanel";
afterEach(cleanup);beforeEach(()=>{mocks.demo=false;mocks.reload.mockReset();});
function show(){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><DataRefreshPanel range={{start:"2026-10-01",end:"2026-10-22"}}/></QueryClientProvider>);}
describe("Recarregar dados",()=>{
 it("informa datas por fonte e não apresenta Google antigo como atualizado",async()=>{show();await screen.findByText("Google Ads");expect(screen.getByText("Dados até: 27/09/2026")).toBeTruthy();expect(screen.getByText("Sem dados no período selecionado")).toBeTruthy();expect(screen.getByText(/Não inicia uma nova coleta/)).toBeTruthy();});
 it("aguarda a atualização real e impede cliques duplicados",async()=>{let done!:()=>void;mocks.reload.mockImplementation(()=>new Promise<void>(resolve=>{done=resolve;}));show();const b=screen.getByRole("button",{name:"Recarregar dados"});fireEvent.click(b);fireEvent.click(b);expect(mocks.reload).toHaveBeenCalledTimes(1);expect(b.getAttribute("aria-busy")).toBe("true");expect((b as HTMLButtonElement).disabled).toBe(true);done();await screen.findByText(/Consultas recarregadas/);expect((b as HTMLButtonElement).disabled).toBe(false);});
 it("exibe falha sem simular sincronização bem-sucedida",async()=>{mocks.reload.mockRejectedValue(new Error("network"));show();fireEvent.click(screen.getByRole("button",{name:"Recarregar dados"}));await screen.findByText(/Não foi possível recarregar/);expect(screen.queryByText(/Consultas recarregadas/)).toBeNull();});
 it("demonstração não rotula datas fictícias como reais",async()=>{mocks.demo=true;show();expect(screen.getByText(/Datas reais de sincronização indisponíveis/)).toBeTruthy();expect(screen.queryByText("Dados até: 22/10/2026")).toBeNull();});
});
