// @vitest-environment jsdom
import {cleanup,render} from "@testing-library/react";
import {afterEach,describe,expect,it} from "vitest";
import {Sparkline} from "./primitives";
afterEach(cleanup);
describe("sparkline sem dados",()=>{
 it("não gera SVG inválido para série ausente",()=>{const {container}=render(<Sparkline points={[]}/>);expect(container.querySelector("path")).toBeNull();});
 it.each([[1],[1,3,2]])("preserva caminho válido com dados %j",(...points)=>{const {container}=render(<Sparkline points={points as number[]}/>);const paths=[...container.querySelectorAll("path")];expect(paths).toHaveLength(2);expect(paths.every(p=>p.getAttribute("d")?.startsWith("M"))).toBe(true);});
});
