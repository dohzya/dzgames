import type { Board, Stack, Step, StepResult } from "./types";
import { CLEAR_AT } from "./constants";
import { getNeighbors, cellXY } from "./geometry";
import { clearPts } from "./scoring";
import { topOf } from "./board";

// Internal mutable board type for BFS computation
type MutableCell = Array<import("./types").ColorId>;
type MutableRow = Array<MutableCell>;
type MutableBoard = Array<MutableRow>;

function copyBoardMutable(board: Board): MutableBoard {
  return board.map((row) => row.map((cell) => [...cell]));
}

function topBlockSize(cell: MutableCell, color: import("./types").ColorId): number {
  let cnt = 0;
  for (let i = cell.length - 1; i >= 0 && cell[i] === color; i--) cnt++;
  return cnt;
}

function transfer(
  steps: Step[],
  board: MutableBoard,
  from: readonly [number, number],
  to: readonly [number, number],
  color: import("./types").ColorId,
  count: number,
  transferCount: { value: number },
  emptiedCells: Set<string>
): void {
  const src = board[from[0]]?.[from[1]];
  const dst = board[to[0]]?.[to[1]];
  if (!src || !dst) return;
  const fromKey = `${String(from[0])},${String(from[1])}`;
  for (let k = 0; k < count; k++) {
    const before: Board = copyBoardMutable(board);
    src.pop();
    dst.push(color);
    transferCount.value++;
    if (src.length === 0) emptiedCells.add(fromKey);
    const after: Board = copyBoardMutable(board);
    steps.push({ type: "transfer", from, to, color, before, after });
  }
}

export function computeSteps(boardIn: Board, tr: number, tc: number, incoming: Stack): StepResult {
  const board: MutableBoard = copyBoardMutable(boardIn);
  const targetRow = board[tr];
  if (targetRow) {
    const targetCell = targetRow[tc];
    if (targetCell) {
      for (const c of incoming) targetCell.push(c);
    }
  }

  const steps: Step[] = [];
  let totalCleared = 0;
  const transferCount = { value: 0 };
  const emptiedCells = new Set<string>();

  const queue: Array<readonly [number, number]> = [[tr, tc]];
  const inQ = new Set<string>([`${String(tr)},${String(tc)}`]);
  const active = new Set<string>();

  while (queue.length > 0) {
    const entry = queue.shift();
    if (!entry) break;
    const [r, c] = entry;
    const key = `${String(r)},${String(c)}`;
    inQ.delete(key);
    if (active.has(key)) continue;
    active.add(key);

    for (;;) {
      let changed = false;
      const tgt = board[r]?.[c];
      if (!tgt) break;

      // Clear check first: handles the case where this cell just received tiles
      // and has no more matching neighbors to transfer with.
      {
        const topCC = topOf(tgt);
        if (topCC !== null) {
          const cnt = topBlockSize(tgt, topCC);
          if (cnt >= CLEAR_AT) {
            const before: Board = copyBoardMutable(board);
            tgt.splice(tgt.length - cnt, cnt);
            totalCleared += cnt;
            const [cx, cy] = cellXY(c, r);
            const after: Board = copyBoardMutable(board);
            steps.push({
              type: "clear",
              at: [r, c],
              color: topCC,
              count: cnt,
              clearPtsBase: clearPts(cnt),
              popX: cx,
              popY: cy,
              before,
              after,
            });
            changed = true;
          }
        }
      }

      const topC = topOf(tgt);
      if (topC === null) break;

      const neighbors = getNeighbors(r, c);

      // Find G: the neighbor with the largest matching top-color block.
      // G is the "destination" tile pile; non-G neighbors relay through current cell.
      let gIdx = -1;
      let gSize = -1;
      for (let ni = 0; ni < neighbors.length; ni++) {
        const nb = neighbors[ni];
        if (!nb) continue;
        const cell = board[nb[0]]?.[nb[1]];
        if (!cell || topOf(cell) !== topC) continue;
        const sz = topBlockSize(cell, topC);
        if (sz > gSize) {
          gSize = sz;
          gIdx = ni;
        }
      }
      if (gIdx === -1) break; // no matching neighbors

      // Step 1: all non-G neighbors give their top-color block to current cell (relay).
      for (let ni = 0; ni < neighbors.length; ni++) {
        if (ni === gIdx) continue;
        const nb = neighbors[ni];
        if (!nb) continue;
        const [r2, c2] = nb;
        const src = board[r2]?.[c2];
        if (!src || topOf(src) !== topC) continue;
        const cnt = topBlockSize(src, topC);
        if (cnt === 0) continue;
        transfer(steps, board, [r2, c2], [r, c], topC, cnt, transferCount, emptiedCells);
        changed = true;
        const sk = `${String(r2)},${String(c2)}`;
        active.delete(sk);
        if (!inQ.has(sk)) {
          queue.push([r2, c2]);
          inQ.add(sk);
        }
      }

      // Step 2: apply the 2-pile rule between current cell and G.
      // Smaller gives to larger; equal → current cell gives to G.
      const gNb = neighbors[gIdx];
      if (!gNb) break;
      const [gr, gc] = gNb;
      const gCell = board[gr]?.[gc];
      if (!gCell || topOf(gCell) !== topC) break;

      const sizeTgt = topBlockSize(tgt, topC);
      const sizeG = topBlockSize(gCell, topC);
      if (sizeTgt === 0 || sizeG === 0) break;

      const gsk = `${String(gr)},${String(gc)}`;
      if (sizeTgt <= sizeG) {
        // Current is smaller or equal → current gives to G
        transfer(steps, board, [r, c], [gr, gc], topC, sizeTgt, transferCount, emptiedCells);
      } else {
        // G is smaller → G gives to current
        transfer(steps, board, [gr, gc], [r, c], topC, sizeG, transferCount, emptiedCells);
      }
      changed = true;
      active.delete(gsk);
      if (!inQ.has(gsk)) {
        queue.push([gr, gc]);
        inQ.add(gsk);
      }

      void changed; // loop exits via break statements above when no progress possible
    }
  }

  return {
    steps,
    finalBoard: board,
    totalCleared,
    transferCount: transferCount.value,
    emptiedCount: emptiedCells.size,
  };
}
