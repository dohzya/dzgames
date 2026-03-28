import { describe, it, expect } from "vitest";
import { comboMult, emptyMult } from "../scoring";

describe("comboMult", () => {
  it("combo 1 → ×1", () => {
    expect(comboMult(1)).toBe(1);
  });
  it("combo 2 → ×2", () => {
    expect(comboMult(2)).toBe(2);
  });
  it("combo 3 → ×3", () => {
    expect(comboMult(3)).toBe(3);
  });
  it("combo 5 → ×5", () => {
    expect(comboMult(5)).toBe(5);
  });
});

describe("emptyMult", () => {
  it("0 piles vidées → ×1", () => {
    expect(emptyMult(0)).toBe(1);
  });
  it("1 pile vidée → ×2", () => {
    expect(emptyMult(1)).toBe(2);
  });
  it("2 piles vidées → ×3", () => {
    expect(emptyMult(2)).toBe(3);
  });
  it("4 piles vidées → ×5", () => {
    expect(emptyMult(4)).toBe(5);
  });
});
