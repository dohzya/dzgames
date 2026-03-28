import { describe, it, expect } from "vitest";
import { initGame } from "../board";
import { getNeighbors } from "../geometry";
import { OR, OC } from "../constants";
import type { CellKey } from "../types";

function toCellKey(r: number, c: number): CellKey {
  return `${String(r)},${String(c)}` as CellKey;
}

// Run initGame() N times and collect results for probabilistic invariants
const RUNS = 30;
const games = Array.from({ length: RUNS }, () => initGame());

describe("initGame", () => {
  it("returns exactly 10 unlocked cells every time", () => {
    for (const { cellMap } of games) {
      const unlocked = [...cellMap.values()].filter((c) => c.state === "unlocked");
      expect(unlocked).toHaveLength(10);
    }
  });

  it("the center cell (OR,OC) is always unlocked and surrounded by unlocked cells", () => {
    for (const { cellMap } of games) {
      const centerKey = toCellKey(OR, OC);
      expect(cellMap.get(centerKey)?.state).toBe("unlocked");

      const neighbors = getNeighbors(OR, OC);
      for (const [nr, nc] of neighbors) {
        const nk = toCellKey(nr, nc);
        expect(cellMap.get(nk)?.state).toBe("unlocked");
      }
    }
  });

  it("the board has exactly 3 non-empty cells every time", () => {
    for (const { board } of games) {
      let nonEmpty = 0;
      for (const row of board) {
        for (const cell of row) {
          if (cell.length > 0) nonEmpty++;
        }
      }
      expect(nonEmpty).toBe(3);
    }
  });

  it("all pre-placed stacks are in unlocked cells", () => {
    for (const { board, cellMap } of games) {
      for (let r = 0; r < board.length; r++) {
        for (let c = 0; c < (board[r]?.length ?? 0); c++) {
          if ((board[r]?.[c]?.length ?? 0) > 0) {
            const info = cellMap.get(toCellKey(r, c));
            expect(info?.state).toBe("unlocked");
          }
        }
      }
    }
  });

  it("exactly 2 pre-placed stacks are monochrome", () => {
    for (const { board } of games) {
      const stacks = [];
      for (const row of board) {
        for (const cell of row) {
          if (cell.length > 0) stacks.push(cell);
        }
      }
      const monochrome = stacks.filter((s) => new Set(s).size === 1);
      expect(monochrome).toHaveLength(2);
    }
  });

  it("exactly 1 pre-placed stack uses exactly 2 distinct colors", () => {
    for (const { board } of games) {
      const stacks = [];
      for (const row of board) {
        for (const cell of row) {
          if (cell.length > 0) stacks.push(cell);
        }
      }
      const twoColor = stacks.filter((s) => new Set(s).size === 2);
      expect(twoColor).toHaveLength(1);
    }
  });

  it("all pre-placed stack colors are within 0..3 (progression 0 has nc=4)", () => {
    for (const { board } of games) {
      for (const row of board) {
        for (const cell of row) {
          for (const color of cell) {
            expect(color).toBeGreaterThanOrEqual(0);
            expect(color).toBeLessThanOrEqual(3);
          }
        }
      }
    }
  });

  it("monochrome stacks use two different colors from each other", () => {
    for (const { board } of games) {
      const monochrome = [];
      for (const row of board) {
        for (const cell of row) {
          if (cell.length > 0 && new Set(cell).size === 1) {
            monochrome.push(cell[0]);
          }
        }
      }
      expect(monochrome).toHaveLength(2);
      expect(monochrome[0]).not.toBe(monochrome[1]);
    }
  });

  it("each monochrome stack has 2 or 3 tiles", () => {
    for (const { board } of games) {
      for (const row of board) {
        for (const cell of row) {
          if (cell.length > 0 && new Set(cell).size === 1) {
            expect(cell.length).toBeGreaterThanOrEqual(2);
            expect(cell.length).toBeLessThanOrEqual(3);
          }
        }
      }
    }
  });

  it("the two-color stack has 3 or 4 tiles", () => {
    for (const { board } of games) {
      for (const row of board) {
        for (const cell of row) {
          if (cell.length > 0 && new Set(cell).size === 2) {
            expect(cell.length).toBeGreaterThanOrEqual(3);
            expect(cell.length).toBeLessThanOrEqual(4);
          }
        }
      }
    }
  });

  it("pre-placed stacks are not on the center cell", () => {
    for (const { board } of games) {
      expect((board[OR]?.[OC] ?? []).length).toBe(0);
    }
  });
});
