// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FrontPerformanceTooltip } from "./FrontPerformanceTooltip";
import type { FrontChartPoint } from "../lib/front-performance";

afterEach(cleanup);
const point: FrontChartPoint = { label: "sem. 28/08", period: "28/08/2026 a 03/09/2026", spend: 220, leads: 12, cpl: 220 / 12 };
const metric = (label: string) => within(screen.getByRole("tooltip")).getByText(label, { exact: true }).closest("div")!.querySelector("b")!.textContent;

describe("tooltip de leads e investimento", () => {
  it("apresenta datas, quantidade, investimento e CPL do agrupamento", () => {
    render(<FrontPerformanceTooltip active payload={[{ payload: point }, { payload: point }]} />);
    expect(screen.getByRole("tooltip").textContent).toContain("28/08/2026 a 03/09/2026");
    expect(metric("Leads")).toBe("12");
    expect(metric("Investimento")).toBe("R$ 220,00");
    expect(metric("CPL")).toBe("R$ 18,33");
    expect(screen.getAllByText("CPL", { exact: true })).toHaveLength(1);
  });

  it("zero leads conserva o investimento registrado e apresenta CPL indisponível", () => {
    render(<FrontPerformanceTooltip active payload={[{ payload: { ...point, leads: 0, spend: 100, cpl: null } }]} />);
    expect(metric("Leads")).toBe("0");
    expect(metric("Investimento")).toBe("R$ 100,00");
    expect(metric("CPL")).toBe("—");
    expect(screen.getByRole("tooltip").textContent).not.toMatch(/Infinity|NaN/);
  });

  it("investimento zero registrado com leads permite CPL zero", () => {
    render(<FrontPerformanceTooltip active payload={[{ payload: { ...point, spend: 0, cpl: 0 } }]} />);
    expect(metric("CPL")).toBe("R$ 0,00");
  });

  it("sem hover ou payload não inventa um tooltip", () => {
    const view = render(<FrontPerformanceTooltip payload={[{ payload: point }]} />);
    expect(screen.queryByRole("tooltip")).toBeNull();
    view.rerender(<FrontPerformanceTooltip active payload={[]} />);
    expect(screen.queryByRole("tooltip")).toBeNull();
    view.rerender(<FrontPerformanceTooltip active payload={[{}]} />);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
