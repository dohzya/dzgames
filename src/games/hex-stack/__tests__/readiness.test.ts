import { describe, it, expect } from "vitest";
import { isCellReady } from "../board";
import type { CellKey, CellMap, CellState, Board, ColorId } from "../types";

function makeBoard(rows: number, cols: number, stacks: Record<string, number[]> = {}): Board {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => (stacks[`${String(r)},${String(c)}`] ?? []) as ColorId[])
  ) as Board;
}

function makeCellMap(entries: Array<[CellKey, CellState]>): CellMap {
  return new Map(entries);
}

const LOCKED_CELL: CellState = {
  state: "locked",
  cost: 10,
  wave: 1,
  revealOrder: 1,
};

const LOCKED_EVER_READY: CellState = {
  state: "locked",
  cost: 10,
  wave: 1,
  revealOrder: 1,
  everReady: true,
};

const UNLOCKED_CELL: CellState = {
  state: "unlocked",
  cost: 0,
  wave: 0,
};

describe("isCellReady", () => {
  it("returns false for an unlocked cell", () => {
    const board = makeBoard(31, 31);
    const cellMap = makeCellMap([["15,15", UNLOCKED_CELL]]);
    expect(isCellReady("15,15", cellMap, board, new Set())).toBe(false);
  });

  it("returns false if the cell is not in the map", () => {
    const board = makeBoard(31, 31);
    const cellMap = makeCellMap([]);
    expect(isCellReady("15,15", cellMap, board, new Set())).toBe(false);
  });

  it("marks a locked auto cell as ready when adjacent to an empty unlocked cell", () => {
    // Cell at 15,15 is locked; cell at 14,15 is unlocked and empty
    const board = makeBoard(31, 31);
    const cellMap = makeCellMap([
      ["15,15", LOCKED_CELL],
      ["14,15", UNLOCKED_CELL],
    ]);
    expect(isCellReady("15,15", cellMap, board, new Set())).toBe(true);
  });

  it("returns false when the only unlocked neighbor has a non-empty stack and is not in lastTransferred", () => {
    // Cell at 15,15 locked; cell at 14,15 unlocked but has a stack
    const board = makeBoard(31, 31, { "14,15": [1] });
    const cellMap = makeCellMap([
      ["15,15", LOCKED_CELL],
      ["14,15", UNLOCKED_CELL],
    ]);
    expect(isCellReady("15,15", cellMap, board, new Set())).toBe(false);
  });

  it("marks a locked cell ready when adjacent to a cell in lastTransferred (even if not empty)", () => {
    const board = makeBoard(31, 31, { "14,15": [1] });
    const cellMap = makeCellMap([
      ["15,15", LOCKED_CELL],
      ["14,15", UNLOCKED_CELL],
    ]);
    expect(isCellReady("15,15", cellMap, board, new Set(["14,15"]))).toBe(true);
  });

  it("keeps a cell ready once everReady is set, even if empty neighbor becomes occupied", () => {
    // everReady is set; the neighbor is now occupied and not in lastTransferred
    const board = makeBoard(31, 31, { "14,15": [1] });
    const cellMap = makeCellMap([
      ["15,15", LOCKED_EVER_READY],
      ["14,15", UNLOCKED_CELL],
    ]);
    expect(isCellReady("15,15", cellMap, board, new Set())).toBe(true);
  });

  it("does NOT mark a cell ready if it was never adjacent to an empty/transferred cell", () => {
    // No unlocked neighbors at all
    const board = makeBoard(31, 31);
    const cellMap = makeCellMap([["15,15", LOCKED_CELL]]);
    expect(isCellReady("15,15", cellMap, board, new Set())).toBe(false);
  });

  it("does NOT mark a cell ready if all unlocked neighbors are occupied and not transferred", () => {
    // Neighbor at 14,15 is unlocked but occupied; no lastTransferred
    const board = makeBoard(31, 31, { "14,15": [2, 3] });
    const cellMap = makeCellMap([
      ["15,15", LOCKED_CELL],
      ["14,15", UNLOCKED_CELL],
    ]);
    expect(isCellReady("15,15", cellMap, board, new Set())).toBe(false);
  });
});
