import { describe, expect, it } from "vitest";
import { delta, money, percent } from "./format";

describe("dashboard formatters", () => {
  it("formats monetary and percentage values in pt-BR", () => {
    expect(money(2217.66)).toBe("R$ 2.217,66");
    expect(percent(1.654)).toBe("1,65%");
  });

  it("returns null when comparison has no valid base", () => {
    expect(delta(10, 0)).toBeNull();
    expect(delta(10, null)).toBeNull();
  });

  it("calculates period variation from totals", () => {
    expect(delta(120, 100)).toBe(20);
  });
});
