// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,describe,expect,it,vi} from "vitest";
import {ImageLightbox} from "./ImageLightbox";
afterEach(cleanup);
describe("ampliação de criativos",()=>{
 it("explica a limitação da imagem pequena",()=>{render(<ImageLightbox src="/small.jpg" label="Criativo vertical" onClose={()=>{}}/>);const img=screen.getByAltText("Criativo vertical");Object.defineProperty(img,"naturalWidth",{value:64});Object.defineProperty(img,"naturalHeight",{value:114});fireEvent.load(img);expect(screen.getByText(/Miniatura de baixa resolução/)).toBeTruthy();});
 it("não alerta baixa resolução para fonte suficiente",()=>{render(<ImageLightbox src="/large.jpg" label="Criativo" onClose={()=>{}}/>);const img=screen.getByAltText("Criativo");Object.defineProperty(img,"naturalWidth",{value:1080});Object.defineProperty(img,"naturalHeight",{value:1920});fireEvent.load(img);expect(screen.queryByText(/Miniatura de baixa resolução/)).toBeNull();});
 it("fecha por Escape e restaura rolagem e foco",()=>{const close=vi.fn();const original=document.body.style.overflow;const {unmount}=render(<ImageLightbox src="/large.jpg" label="Criativo" onClose={close}/>);expect(document.body.style.overflow).toBe("hidden");fireEvent.keyDown(document,{key:"Escape"});expect(close).toHaveBeenCalledOnce();unmount();expect(document.body.style.overflow).toBe(original);});
 it("apresenta indisponibilidade quando a imagem falha",()=>{render(<ImageLightbox src="/bad.jpg" label="Criativo" onClose={()=>{}}/>);fireEvent.error(screen.getByAltText("Criativo"));expect(screen.getByRole("status").textContent).toContain("Não foi possível carregar");});
});
