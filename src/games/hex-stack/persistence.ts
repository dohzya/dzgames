import type { Board, Stack, CellKey, CellState } from "./types";

export type SavedState = {
  readonly board: Board;
  readonly incoming: ReadonlyArray<Stack>;
  readonly cellMap: ReadonlyArray<readonly [CellKey, CellState]>;
  readonly points: number;
  readonly cleared: number;
  readonly moveCount: number;
  readonly combo: number;
  readonly actionUsages: { readonly swap: number; readonly bubble: number; readonly trim: number };
};

const SAVE_KEY = "dzgames:hex-stack:save";

export function saveGame(state: SavedState): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

function isValidSavedState(obj: unknown): obj is SavedState {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  if (!Array.isArray(o["board"])) return false;
  if (!Array.isArray(o["incoming"])) return false;
  if (!Array.isArray(o["cellMap"])) return false;
  if (typeof o["points"] !== "number") return false;
  if (typeof o["cleared"] !== "number") return false;
  if (typeof o["moveCount"] !== "number") return false;
  if (typeof o["combo"] !== "number") return false;
  if (typeof o["actionUsages"] !== "object" || o["actionUsages"] === null) return false;
  const au = o["actionUsages"] as Record<string, unknown>;
  if (typeof au["swap"] !== "number") return false;
  if (typeof au["bubble"] !== "number") return false;
  if (typeof au["trim"] !== "number") return false;
  return true;
}

export function loadGame(): SavedState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidSavedState(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY);
}
