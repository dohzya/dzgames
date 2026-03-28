import type {
  Board,
  Stack,
  ColorId,
  CellKey,
  CellState,
  CellMap,
  Snapshot,
  Progression,
} from "./types";
import { VROWS, VCOLS, OR, OC } from "./constants";
import { getNeighbors } from "./geometry";
import { baseCostForWave } from "./scoring";
import { getProgression } from "./progression";

export function topOf(stack: Stack): ColorId | null {
  return stack.length > 0 ? (stack[stack.length - 1] ?? null) : null;
}

export function copyBoard(board: Board): Array<Array<Array<ColorId>>> {
  return board.map((row) => row.map((cell) => [...cell]));
}

export function initBoard(): Board {
  return Array.from({ length: VROWS }, () => Array.from({ length: VCOLS }, () => [] as ColorId[]));
}

export function rndStack(progression: Progression): Stack {
  const { nc, maxColors } = progression;
  const total = 2 + Math.floor(Math.random() * 4);
  const numColors = 1 + Math.floor(Math.random() * Math.min(maxColors, nc));
  const pool: number[] = [];
  while (pool.length < numColors) {
    const c = Math.floor(Math.random() * nc);
    if (!pool.includes(c)) pool.push(c);
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = pool[i];
    const tmp2 = pool[j];
    if (tmp !== undefined && tmp2 !== undefined) {
      pool[i] = tmp2;
      pool[j] = tmp;
    }
  }
  const sizes = Array<number>(numColors).fill(1);
  for (let k = numColors; k < total; k++) {
    const idx = Math.floor(Math.random() * numColors) | 0;
    const current = sizes[idx];
    if (current !== undefined) sizes[idx] = current + 1;
  }
  const arr: ColorId[] = [];
  for (let i = 0; i < numColors; i++) {
    const s = sizes[i] ?? 1;
    const c = pool[i];
    if (c !== undefined) {
      for (let j = 0; j < s; j++) arr.push(c as ColorId);
    }
  }
  return arr;
}

export function rndPreStack(progression: Progression): Stack {
  const { nc } = progression;
  const ncForPre = Math.min(nc, 4);
  const proj: Progression = { nc: ncForPre, maxColors: Math.min(2, progression.maxColors) };
  return rndStack(proj);
}

export function makeLockedCell(wave: number, progression: Progression, revealOrder = 1): CellState {
  const base = baseCostForWave(wave);
  const orderMult = 1 + Math.log1p(revealOrder - 1) * 0.8;
  const scaledBase = Math.round(base * orderMult);
  const rnd = Math.random();

  function preStackN(nc: number): Stack {
    const n = Math.min(nc, Math.max(1, progression.nc));
    return rndPreStack({ nc: n, maxColors: Math.min(n, progression.maxColors) });
  }

  if (rnd < 0.1) {
    return {
      state: "locked",
      cost: 0,
      wave,
      revealOrder,
      autoUnlock: Math.max(60, Math.round(scaledBase * 1.5 + 40)),
      preStack: preStackN(3),
    };
  }
  if (rnd < 0.67) {
    return {
      state: "locked",
      cost: 0,
      wave,
      revealOrder,
      autoUnlock: Math.max(40, Math.round(scaledBase * 1.0 + 25)),
      preStack: preStackN(4),
    };
  }
  if (rnd < 0.77) {
    return {
      state: "locked",
      cost: 0,
      wave,
      revealOrder,
      autoUnlock: Math.max(20, Math.round(scaledBase * 0.5 + 15)),
      preStack: preStackN(5),
    };
  }
  if (rnd < 0.8) {
    return {
      state: "locked",
      cost: 0,
      wave,
      revealOrder,
      autoUnlock: Math.max(100, Math.round(scaledBase * 2.0 + 60)),
    };
  }
  return {
    state: "locked",
    cost: Math.max(20, scaledBase),
    wave,
    revealOrder,
  };
}

function toCellKey(r: number, c: number): CellKey {
  return `${String(r)},${String(c)}` as CellKey;
}

export function revealNeighbors(
  map: Map<CellKey, CellState>,
  row: number,
  col: number,
  parentWave: number,
  progression: Progression
): void {
  const childWave = parentWave + 1;
  const toReveal: Array<readonly [number, number]> = getNeighbors(row, col)
    .filter(
      ([nr, nc]) => !map.has(toCellKey(nr, nc)) && nr >= 0 && nr < VROWS && nc >= 0 && nc < VCOLS
    )
    .map(([nr, nc]) => [nr, nc] as const);

  // Shuffle for random cost ordering
  for (let i = toReveal.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = toReveal[i];
    const tmp2 = toReveal[j];
    if (tmp !== undefined && tmp2 !== undefined) {
      toReveal[i] = tmp2;
      toReveal[j] = tmp;
    }
  }
  toReveal.forEach(([nr, nc]) => {
    const order = map.size + 1;
    map.set(toCellKey(nr, nc), makeLockedCell(childWave, progression, order));
  });
}

function parseKey(k: string): readonly [number, number] {
  const [rStr, cStr] = k.split(",");
  return [Number(rStr), Number(cStr)];
}

function buildCellMap(unlocked: ReadonlySet<string>): CellMap {
  const m = new Map<CellKey, CellState>();
  unlocked.forEach((k) => m.set(k as CellKey, { state: "unlocked", cost: 0, wave: 0 }));

  const startProg = getProgression(0);

  const ring1 = new Set<string>();
  unlocked.forEach((k) => {
    const [r, c] = parseKey(k);
    getNeighbors(r, c).forEach(([nr, nc]) => {
      const nk = `${String(nr)},${String(nc)}`;
      if (!unlocked.has(nk)) ring1.add(nk);
    });
  });
  const ring1arr = [...ring1].sort(() => Math.random() - 0.5);
  ring1arr.forEach((k) => {
    m.set(k as CellKey, makeLockedCell(1, startProg, m.size + 1));
  });

  const ring2 = new Set<string>();
  ring1.forEach((k) => {
    const [r, c] = parseKey(k);
    getNeighbors(r, c).forEach(([nr, nc]) => {
      const nk = `${String(nr)},${String(nc)}`;
      if (!unlocked.has(nk) && !ring1.has(nk) && !m.has(nk as CellKey)) ring2.add(nk);
    });
  });
  const ring2arr = [...ring2].sort(() => Math.random() - 0.5);
  ring2arr.forEach((k) => {
    m.set(k as CellKey, makeLockedCell(2, startProg, m.size + 1));
  });

  return m;
}

export function initCellMap(): CellMap {
  const unlocked = new Set<string>([`${String(OR)},${String(OC)}`]);
  const frontier = getNeighbors(OR, OC).map(([r, c]) => `${String(r)},${String(c)}`);
  while (unlocked.size < 10 && frontier.length > 0) {
    const idx = Math.floor(Math.random() * frontier.length);
    const k = frontier.splice(idx, 1)[0];
    if (k === undefined) continue;
    if (unlocked.has(k)) continue;
    unlocked.add(k);
    const [r, c] = parseKey(k);
    getNeighbors(r, c).forEach(([nr, nc]) => {
      const nk = `${String(nr)},${String(nc)}`;
      if (!unlocked.has(nk) && !frontier.includes(nk)) frontier.push(nk);
    });
  }
  return buildCellMap(unlocked);
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = arr[i];
    const b = arr[j];
    if (a !== undefined && b !== undefined) {
      arr[i] = b;
      arr[j] = a;
    }
  }
  return arr;
}

export function initGame(): { readonly board: Board; readonly cellMap: CellMap } {
  // Always include center + all 6 neighbors (7 cells) so the center is guaranteed surrounded.
  const centerKey = `${String(OR)},${String(OC)}`;
  const unlocked = new Set<string>([centerKey]);
  getNeighbors(OR, OC).forEach(([r, c]) => unlocked.add(`${String(r)},${String(c)}`));

  // BFS to add 3 more cells for a total of 10.
  const frontier: string[] = [];
  unlocked.forEach((k) => {
    const [r, c] = parseKey(k);
    getNeighbors(r, c).forEach(([nr, nc]) => {
      const nk = `${String(nr)},${String(nc)}`;
      if (!unlocked.has(nk) && !frontier.includes(nk)) frontier.push(nk);
    });
  });
  while (unlocked.size < 10 && frontier.length > 0) {
    const idx = Math.floor(Math.random() * frontier.length);
    const k = frontier.splice(idx, 1)[0];
    if (k === undefined || unlocked.has(k)) continue;
    unlocked.add(k);
    const [r, c] = parseKey(k);
    getNeighbors(r, c).forEach(([nr, nc]) => {
      const nk = `${String(nr)},${String(nc)}`;
      if (!unlocked.has(nk) && !frontier.includes(nk)) frontier.push(nk);
    });
  }

  // Pick 3 unlocked cells (not the center) for pre-placed stacks.
  const candidates = shuffle([...unlocked].filter((k) => k !== centerKey));
  const stackCells = candidates.slice(0, 3);

  // Colors: pick 4 distinct colors from progression(0) (nc=4) and shuffle.
  const prog = getProgression(0);
  const colors = shuffle(Array.from({ length: prog.nc }, (_, i) => i as ColorId));
  const [cA, cB, cC, cD] = colors as [ColorId, ColorId, ColorId, ColorId];

  // Stack 1: monochrome cA, 2–3 tiles.
  const size1 = 2 + Math.floor(Math.random() * 2);
  const stack1: ColorId[] = Array.from({ length: size1 }, () => cA);

  // Stack 2: monochrome cB, 2–3 tiles.
  const size2 = 2 + Math.floor(Math.random() * 2);
  const stack2: ColorId[] = Array.from({ length: size2 }, () => cB);

  // Stack 3: two-color (cC + cD), 3–4 tiles.
  const size3 = 3 + Math.floor(Math.random() * 2);
  const half = Math.floor(size3 / 2);
  const stack3: ColorId[] = [
    ...Array.from({ length: half }, () => cC),
    ...Array.from({ length: size3 - half }, () => cD),
  ];

  const stacks = [stack1, stack2, stack3];

  // Build the board and place the stacks.
  const mutableBoard: Array<Array<Array<ColorId>>> = Array.from({ length: VROWS }, () =>
    Array.from({ length: VCOLS }, () => [])
  );
  stackCells.forEach((k, i) => {
    const [r, c] = parseKey(k);
    const st = stacks[i];
    const row = mutableBoard[r];
    if (st !== undefined && row !== undefined) {
      row[c] = st;
    }
  });

  return { board: mutableBoard, cellMap: buildCellMap(unlocked) };
}

export function isCellReady(
  key: CellKey,
  cellMap: CellMap,
  board: Board,
  lastTransferred: ReadonlySet<string>
): boolean {
  const cell = cellMap.get(key);
  if (!cell || cell.state !== "locked") return false;
  if (cell.everReady) return true;
  const [rStr, cStr] = key.split(",");
  const r = Number(rStr);
  const c = Number(cStr);
  return getNeighbors(r, c).some(([nr, nc]) => {
    const nk = `${String(nr)},${String(nc)}` as CellKey;
    const info = cellMap.get(nk);
    if (!info || info.state !== "unlocked") return false;
    return board[nr]?.[nc]?.length === 0 || lastTransferred.has(nk);
  });
}

export function makeSnap(
  board: Board,
  incoming: ReadonlyArray<Stack>,
  cellMap: CellMap,
  points: number,
  cleared: number,
  moveCount: number,
  combo: number
): Snapshot {
  return {
    board: copyBoard(board),
    incoming: [...incoming.map((s) => [...s])],
    cellMap: new Map(cellMap),
    points,
    cleared,
    moveCount,
    combo,
  };
}
