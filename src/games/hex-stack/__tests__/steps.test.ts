import { describe, it, expect } from "vitest";
import { computeSteps } from "../steps";
import type { ColorId } from "../types";
import { VROWS, VCOLS } from "../constants";

// ─── helpers ────────────────────────────────────────────────────────────────

function emptyBoard(): Array<Array<Array<ColorId>>> {
  return Array.from({ length: VROWS }, () => Array.from({ length: VCOLS }, () => [] as ColorId[]));
}

function boardWith(cells: Record<string, ColorId[]>): Array<Array<Array<ColorId>>> {
  const b = emptyBoard();
  for (const [key, stack] of Object.entries(cells)) {
    const [rStr, cStr] = key.split(",");
    const row = b[Number(rStr)];
    if (row !== undefined) row[Number(cStr)] = [...stack];
  }
  return b;
}

function at(board: ReturnType<typeof computeSteps>["finalBoard"], r: number, c: number): ColorId[] {
  return [...(board[r]?.[c] ?? [])];
}

// ─── cell layout ────────────────────────────────────────────────────────────
// B = (15,15) – placed cell (OC=15 is odd, neighbors use dr=1)
// C = (14,15) – row-1 neighbor (adjacent to B)
// A = (16,15) – row+1 neighbor (adjacent to B)
//
// Verify A–C non-adjacency:
//   neighbors of A=(16,15): with OC=15 odd, dr=1 →
//   (15,15),(17,15),(16,14),(17,14),(16,16),(17,16)
//   → C=(14,15) is NOT in this list. ✓  A and C are NOT adjacent.

const B = { r: 15, c: 15 } as const;
const C = { r: 14, c: 15 } as const; // up-neighbor
const A = { r: 16, c: 15 } as const; // down-neighbor

// ─── 2-pile cases ────────────────────────────────────────────────────────────

describe("computeSteps – 2-pile transfers", () => {
  it("case 1 – placed(1) smaller than neighbor(3): placed gives to neighbor", () => {
    // B=1, C=3 → B<C → B→C: B=0, C=4
    const board = boardWith({ "14,15": [2, 2, 2] });
    const { finalBoard } = computeSteps(board, B.r, B.c, [2]);

    expect(at(finalBoard, B.r, B.c)).toEqual([]);
    expect(at(finalBoard, C.r, C.c)).toEqual([2, 2, 2, 2]);
  });

  it("case 2 – placed(4) larger than neighbor(1): neighbor gives to placed", () => {
    // board has B=[2,2,2], place [2] → B=4. C=[2](1). C<B → C→B: C=0, B=5
    const board = boardWith({ "15,15": [2, 2, 2], "14,15": [2] });
    const { finalBoard } = computeSteps(board, B.r, B.c, [2]);

    expect(at(finalBoard, B.r, B.c)).toEqual([2, 2, 2, 2, 2]);
    expect(at(finalBoard, C.r, C.c)).toEqual([]);
  });

  it("case 3 – equal blocks: placed gives to neighbor", () => {
    // B=2, C=2 → equal → B→C: B=0, C=4
    const board = boardWith({ "14,15": [2, 2] });
    const { finalBoard } = computeSteps(board, B.r, B.c, [2, 2]);

    expect(at(finalBoard, B.r, B.c)).toEqual([]);
    expect(at(finalBoard, C.r, C.c)).toEqual([2, 2, 2, 2]);
  });

  it("no matching neighbor – no transfer, placed stack stays", () => {
    const board = boardWith({ "14,15": [1] });
    const { finalBoard, steps } = computeSteps(board, B.r, B.c, [2]);

    expect(at(finalBoard, B.r, B.c)).toEqual([2]);
    expect(at(finalBoard, C.r, C.c)).toEqual([1]);
    expect(steps.filter((s) => s.type === "transfer")).toHaveLength(0);
  });

  it("only top color block is transferred, base preserved", () => {
    // C=[1,1,2,2] (top block = 2 tiles of color 2), B places [2,2,2] (3 tiles)
    // B(3) > C-top-block(2) → C→B: C loses top 2, C=[1,1]; B=[2,2,2,2,2]
    const board = boardWith({ "14,15": [1, 1, 2, 2] });
    const { finalBoard } = computeSteps(board, B.r, B.c, [2, 2, 2]);

    expect(at(finalBoard, B.r, B.c)).toEqual([2, 2, 2, 2, 2]);
    expect(at(finalBoard, C.r, C.c)).toEqual([1, 1]);
  });
});

// ─── 3-pile relay cases (A and C NOT adjacent) ───────────────────────────────

describe("computeSteps – 3-pile relay (A and C not adjacent)", () => {
  it("case 4 – B=1, A=2, C=3: G=C, A→B then B→C → A=0 B=0 C=6", () => {
    // A=(16,15)=[2,2], B=(15,15)=[], C=(14,15)=[2,2,2]
    // G=C(3). Non-G: A(2)→B: A=0,B=3. B(3)=C(3) equal: B→C: B=0,C=6.
    const board = boardWith({ "16,15": [2, 2], "14,15": [2, 2, 2] });
    const { finalBoard } = computeSteps(board, B.r, B.c, [2]);

    expect(at(finalBoard, A.r, A.c)).toEqual([]);
    expect(at(finalBoard, B.r, B.c)).toEqual([]);
    expect(at(finalBoard, C.r, C.c)).toEqual([2, 2, 2, 2, 2, 2]);
  });

  it("case 5 – B=1, A=3, C=2: G=A, C→B then B→A → A=6 B=0 C=0", () => {
    // A=(16,15)=[2,2,2], B=(15,15)=[], C=(14,15)=[2,2]
    // G=A(3). Non-G: C(2)→B: C=0,B=3. B(3)=A(3) equal: B→A: B=0,A=6.
    const board = boardWith({ "16,15": [2, 2, 2], "14,15": [2, 2] });
    const { finalBoard } = computeSteps(board, B.r, B.c, [2]);

    expect(at(finalBoard, A.r, A.c)).toEqual([2, 2, 2, 2, 2, 2]);
    expect(at(finalBoard, B.r, B.c)).toEqual([]);
    expect(at(finalBoard, C.r, C.c)).toEqual([]);
  });

  it("case 6 – B=1, A=4, C=3: G=A, C→B then B→A → A=8 B=0 C=0", () => {
    // A=(16,15)=[2,2,2,2], B=(15,15)=[], C=(14,15)=[2,2,2]
    // G=A(4). Non-G: C(3)→B: C=0,B=4. B(4)=A(4) equal: B→A: B=0,A=8.
    const board = boardWith({ "16,15": [2, 2, 2, 2], "14,15": [2, 2, 2] });
    const { finalBoard } = computeSteps(board, B.r, B.c, [2]);

    expect(at(finalBoard, A.r, A.c)).toEqual([2, 2, 2, 2, 2, 2, 2, 2]);
    expect(at(finalBoard, B.r, B.c)).toEqual([]);
    expect(at(finalBoard, C.r, C.c)).toEqual([]);
  });
});
