// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Pacing } from './primitives';
afterEach(cleanup);
const props={label:'Publicações',goal:20,ratio:0.5,color:'red',format:String};
it('does not project an unavailable manual observation',()=>{
 const {container}=render(<Pacing {...props} actual={null}/>);
 expect(container.querySelector('.pacing-values b')?.textContent).toBe('—');
 expect(screen.getByText('Aguardando preenchimento manual.')).toBeTruthy();
 expect(container.querySelector('.pacing-foot')?.textContent).not.toContain('projeção');
});
it('keeps an explicitly entered zero as an observed value',()=>{
 const {container}=render(<Pacing {...props} actual={0}/>);
 expect(container.querySelector('.pacing-values b')?.textContent).toBe('0');
 expect(container.querySelector('.pacing-foot')?.textContent).toContain('0% da meta');
});
