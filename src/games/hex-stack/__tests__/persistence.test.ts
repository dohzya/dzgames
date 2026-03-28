import { describe, it, expect, beforeEach } from "vitest";
import { saveGame, loadGame, clearSave } from "../persistence";
import type { SavedState } from "../persistence";

const MINIMAL_STATE: SavedState = {
  board: [[[1, 2], [3]], [], [[]]],
  incoming: [
    [1, 2],
    [3, 4, 5],
  ],
  cellMap: [
    ["3,4", { state: "unlocked", cost: 0, wave: 0 }],
    ["5,6", { state: "locked", cost: 10, wave: 1, revealOrder: 2 }],
  ],
  points: 42,
  cleared: 7,
  moveCount: 15,
  combo: 3,
  actionUsages: { swap: 1, bubble: 2, trim: 0 },
};

describe("persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("saveGame + loadGame round-trip preserves all fields", () => {
    saveGame(MINIMAL_STATE);
    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded?.points).toBe(42);
    expect(loaded?.cleared).toBe(7);
    expect(loaded?.moveCount).toBe(15);
    expect(loaded?.combo).toBe(3);
    expect(loaded?.actionUsages).toEqual({ swap: 1, bubble: 2, trim: 0 });
    expect(loaded?.board).toEqual(MINIMAL_STATE.board);
    expect(loaded?.incoming).toEqual(MINIMAL_STATE.incoming);
    expect(loaded?.cellMap).toEqual(MINIMAL_STATE.cellMap);
  });

  it("loadGame returns null when localStorage is empty", () => {
    expect(loadGame()).toBeNull();
  });

  it("loadGame returns null on malformed JSON", () => {
    localStorage.setItem("dzgames:hex-stack:save", "not-valid-json{{{");
    expect(loadGame()).toBeNull();
  });

  it("loadGame returns null when required fields are missing", () => {
    localStorage.setItem(
      "dzgames:hex-stack:save",
      JSON.stringify({ points: 10 }) // missing board, incoming, cellMap, etc.
    );
    expect(loadGame()).toBeNull();
  });

  it("clearSave removes the key", () => {
    saveGame(MINIMAL_STATE);
    clearSave();
    expect(localStorage.getItem("dzgames:hex-stack:save")).toBeNull();
  });
});
