// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,describe,expect,it,vi} from "vitest";
vi.mock("../lib/supabase",()=>({supabase:null}));
import {CreativeCard} from "../views/FrontView";
import type {Creative} from "../types";
afterEach(cleanup);
const c:Creative={id:"video",name:"Vídeo vertical",front:"condominium",channel:"meta_ads",format:"video",creative_type:"video",preview_url:"https://example.test/private-preview.jpg",headline:"Peça de teste",palette:["#123","#234"],spend:100,impressions:1000,clicks:10,leads:5,cpl:20,ctr:1,hook_rate:null};
describe("card de criativo",()=>{
 it("preserva proporção da imagem e métricas ao abrir a ampliação",()=>{const {container}=render(<CreativeCard c={c} rank={1}/>);const img=container.querySelector(".creative-zoom img")!;Object.defineProperty(img,"naturalWidth",{value:1080});Object.defineProperty(img,"naturalHeight",{value:1920});fireEvent.load(img);expect(container.querySelector(".creative-resolution")).toBeNull();expect(container.querySelector(".creative-art")?.classList.contains("creative-art-limited")).toBe(false);expect(container.querySelector(".creative-stats")?.textContent).toContain("5leads");expect(container.querySelector(".creative-stats")?.textContent).toContain("20");fireEvent.click(screen.getByRole("button",{name:"Ampliar imagem: Vídeo vertical"}));expect(screen.getByRole("dialog")).toBeTruthy();expect(container.querySelector(".creative-stats")?.textContent).toContain("CTR");});
 it("falha de imagem mantém resultados e não abre modal vazio",()=>{const {container}=render(<CreativeCard c={c} rank={1}/>);fireEvent.error(container.querySelector(".creative-zoom img")!);expect(screen.queryByRole("button",{name:/Ampliar imagem/})).toBeNull();expect(container.querySelector(".creative-stats")?.textContent).toContain("5leads");});
});
