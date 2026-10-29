// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImageLightbox } from "./ImageLightbox";
afterEach(cleanup);
function load(width: number, height: number) {
  const img=screen.getByRole('img');Object.defineProperties(img,{naturalWidth:{value:width,configurable:true},naturalHeight:{value:height,configurable:true}});
  fireEvent.load(img);return img;
}
describe('creative image inspection',()=>{
  it('shows actual dimensions and caps a low resolution source',()=>{
    render(<ImageLightbox src="https://storage.example/low.jpg" label="Vídeo" onClose={()=>{}}/>);
    const img=load(160,284);
    expect(img.closest('.lightbox-frame')?.classList.contains('lightbox-frame-vertical')).toBe(true);
    expect(screen.getByText(/160 × 284 px/).textContent).toContain('baixa resolução');
    expect(img.style.maxWidth).toBe('320px');expect(img.style.maxHeight).toBe('568px');
  });
  it.each([[1080,1920],[1920,1080],[1080,1350]])('keeps %s x %s unrestricted by intrinsic dimensions',(w,h)=>{
    render(<ImageLightbox src="https://storage.example/high.jpg" label="Criativo" onClose={()=>{}}/>);
    const img=load(w,h);expect(img.style.maxWidth).toBe('');expect(screen.queryByText(/baixa resolução/)).toBeNull();
  });
  it('closes by Escape/button, traps focus and restores scrolling/focus',()=>{
    const opener=document.createElement('button');document.body.append(opener);opener.focus();
    const close=vi.fn();const {unmount}=render(<ImageLightbox src="https://storage.example/img.jpg" label="Criativo" onClose={close}/>);
    const button=screen.getByRole('button',{name:'Fechar imagem ampliada'});expect(document.activeElement).toBe(button);
    expect(document.body.style.overflow).toBe('hidden');fireEvent.keyDown(document,{key:'Tab',shiftKey:true});expect(document.activeElement).toBe(button);
    fireEvent.keyDown(document,{key:'Escape'});fireEvent.click(button);expect(close).toHaveBeenCalledTimes(2);
    unmount();expect(document.activeElement).toBe(opener);expect(document.body.style.overflow).toBe('');opener.remove();
  });
  it('renews a failed/expired private URL once, then explains a persistent failure',async()=>{
    const refresh=vi.fn(async()=> 'https://storage.example/img.jpg?token=new');
    render(<ImageLightbox src="https://storage.example/img.jpg?token=expired" label="Criativo" onClose={()=>{}} refreshSrc={refresh}/>);
    fireEvent.error(screen.getByRole('img'));
    await waitFor(()=>expect(screen.getByRole('img').getAttribute('src')).toContain('token=new'));
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('status').textContent).toContain('Não foi possível');expect(refresh).toHaveBeenCalledOnce();
  });
});
