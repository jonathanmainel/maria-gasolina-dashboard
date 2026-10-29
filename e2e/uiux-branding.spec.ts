import {test,expect,type Page} from '@playwright/test';
import {install} from './fixtures/ui-audit.mjs';
const sizes=[[1920,1080],[1440,900],[1024,768],[768,1024],[390,844],[360,800],[1152,720],[960,600],[900,900],[901,900]];
async function fits(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);}
async function logo(page:Page,width:number){
 const image=page.getByRole('img',{name:'Maria Gasolina Express',exact:true});await expect(image).toHaveCount(1);await expect(image).toBeVisible();await expect(image).toBeInViewport();await expect.poll(()=>image.evaluate(e=>(e as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
 if(width<=900){await expect(page.locator('.auth-brand-panel')).toBeHidden();await expect(page.locator('.login-logo')).toBeVisible();const positions=await page.evaluate(()=>{const card=document.querySelector('.login-card')!.getBoundingClientRect(),img=document.querySelector('.login-logo img')!.getBoundingClientRect(),text=document.querySelector('.login-card .eyebrow')!.getBoundingClientRect();return {left:img.left-card.left,right:card.right-img.right,gap:text.top-img.bottom};});expect(positions.left).toBeGreaterThanOrEqual(0);expect(positions.right).toBeGreaterThanOrEqual(0);expect(positions.gap).toBeGreaterThanOrEqual(10);}
 else{await expect(page.locator('.auth-brand-panel')).toBeVisible();await expect(page.locator('.login-logo')).toBeHidden();}
 await fits(page);
}
for(const theme of ['dark','light'])for(const [width,height] of sizes)test(`origin and login ${width} ${theme}`,async({page,context},info)=>{
 await page.setViewportSize({width,height});const state=await install(context,{theme});await page.clock.setFixedTime(new Date('2026-10-28T15:00:00Z'));const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/dashboard/maria-gasolina?view=organic');await expect(page.locator('.view-enter')).toBeVisible();await expect(page.locator('.skeleton')).toHaveCount(0);await page.evaluate(()=>document.fonts.ready);await page.mouse.move(0,0);
 await expect(page.locator('.view-head')).toContainText('demonstração · integração pendente');await expect(page.locator('.view-head')).not.toContainText('conta oficial');await expect(page.locator('.demo-note')).toContainText('não devem ser usados em relatórios');
 const dot=await page.locator('.view-head .eyebrow i').boundingBox();expect(dot?.width).toBe(8);expect(dot?.height).toBe(8);
 for(const name of ['Instagram','Facebook','Visão Geral']){await page.getByRole('tab',{name,exact:true}).click();await expect(page.locator('.demo-note')).toBeVisible();}
 await fits(page);await page.screenshot({path:info.outputPath(`organic-${width}-${theme}.png`),fullPage:true,animations:'disabled'});
 await page.addInitScript(()=>localStorage.removeItem('sb-127-auth-token'));await page.goto('/login');await expect(page.locator('.auth-page')).toBeVisible();await page.evaluate(()=>document.fonts.ready);await logo(page,width);
 const button=page.getByRole('button',{name:/Continuar com Google/});await button.focus();await expect(button).toBeFocused();await expect(button).toBeInViewport();await page.screenshot({path:info.outputPath(`login-${width}-${theme}.png`),fullPage:true,animations:'disabled'});
 expect(errors).toEqual([]);expect(state.writes).toEqual([]);expect(state.blocked).toEqual([]);
});
for(const theme of ['dark','light'])for(const [width,height] of [[1440,900],[360,800]])test(`callback error returns to branded login ${width} ${theme}`,async({page,context},info)=>{
 await page.setViewportSize({width,height});const state=await install(context,{theme,auth:false});await page.goto('/auth/callback?code=AUDIT_INVALID_LOCAL_ONLY');await expect(page.getByRole('heading',{name:'Não foi possível concluir o login',exact:true})).toBeVisible();await fits(page);await page.screenshot({path:info.outputPath(`callback-error-${width}-${theme}.png`),fullPage:true});
 const back=page.getByRole('link',{name:'Voltar para o login',exact:true});await back.focus();await page.keyboard.press('Enter');await expect(page.locator('.auth-page')).toBeVisible();await logo(page,width);expect(state.writes).toEqual([]);expect(state.blocked).toEqual([]);
});
