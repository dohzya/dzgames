import { describe, it, expect } from "vitest";
import { pickWeightedColor } from "../board";

// COLOR_WEIGHTS = [1, 1, 1, 1, 0.7, 0.49, 0.34, 0.24], total(nc=8) = 5.77

describe("pickWeightedColor", () => {
  it("nc=4 rnd=0 → color 0", () => {
    expect(pickWeightedColor(4, 0)).toBe(0);
  });

  it("nc=4 rnd=0.999 → color 3", () => {
    expect(pickWeightedColor(4, 0.999)).toBe(3);
  });

  it("nc=5 rnd=0.86 → color 4 (violet)", () => {
    // total=4.7; r=0.86*4.7=4.042; after 4 base colors: r=0.042; -0.7 → color 4
    expect(pickWeightedColor(5, 0.86)).toBe(4);
  });

  it("nc=8 rnd=0.9 → color 6 (blanc)", () => {
    // total=5.77; r=5.193; after 4+0.7+0.49=5.19 → r≈0.003; -0.34 → color 6
    expect(pickWeightedColor(8, 0.9)).toBe(6);
  });

  it("nc=8 rnd=0.96 → color 7 (noir)", () => {
    // total=5.77; r=5.539; after 4+0.7+0.49+0.34=5.53 → r≈0.009; -0.24 → color 7
    expect(pickWeightedColor(8, 0.96)).toBe(7);
  });

  it("nc=8 rnd=0 → color 0", () => {
    expect(pickWeightedColor(8, 0)).toBe(0);
  });
});
