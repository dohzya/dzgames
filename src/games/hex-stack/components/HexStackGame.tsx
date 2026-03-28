import type React from "react";
import { useState, useEffect, useRef, useMemo } from "react";
import type {
  Board,
  Stack,
  Step,
  CellMap,
  CellKey,
  CellState,
  Popup,
  ToolType,
  ColorId,
} from "../types";
import {
  R,
  LAYER_H,
  MAX_VIS,
  SIDE_D,
  VIEWPORT_W,
  VIEWPORT_H,
  UNDO_COST,
  INIT_PAN,
  INC_CX,
  INC_CY,
  INC_H,
  COLORS,
} from "../constants";
import { cellXY, rhp, sidePath, getNeighbors } from "../geometry";
import { getProgression } from "../progression";
import { comboMult, transferBonus, emptyMult } from "../scoring";
import {
  topOf,
  copyBoard,
  rndStack,
  revealNeighbors,
  initGame,
  makeSnap,
  isCellReady,
} from "../board";
import { computeSteps } from "../steps";
import { saveGame, loadGame, clearSave } from "../persistence";
import HexDefs from "./HexDefs";
import FloorHex from "./FloorHex";
import Stack3D from "./Stack3D";

type FlyHexState = {
  readonly key: number;
  readonly fromCol: number;
  readonly fromRow: number;
  readonly toCol: number;
  readonly toRow: number;
  readonly color: ColorId;
};

type DraggingState = { readonly idx: number };

type PanStart = {
  readonly cx: number;
  readonly cy: number;
  readonly ox: number;
  readonly oy: number;
};
type ClickStart = { readonly x: number; readonly y: number };

type LiveState = {
  board: Board;
  incoming: ReadonlyArray<Stack>;
  cellMap: CellMap;
  points: number;
  cleared: number;
  moveCount: number;
  combo: number;
  isAnimating: boolean;
  dragging: DraggingState | null;
  panning: boolean;
  panOffset: { x: number; y: number };
  history: ReadonlyArray<ReturnType<typeof makeSnap>>;
  gameOver: boolean;
  activeTool: ToolType | null;
  lastTransferred: ReadonlySet<string>;
};

type LastMoveInfo = {
  readonly total: number;
  readonly combo: number;
  readonly eMult: number;
  readonly tBonus: number;
};

type CbRef = {
  dragMove: (cx: number, cy: number) => void;
  dragEnd: (cx: number, cy: number) => void;
  panMove: (cx: number, cy: number) => void;
  panEnd: (cx: number, cy: number) => void;
};

type HexStackGameProps = {
  readonly onBack: () => void;
};

function FlyHex({
  fromCol,
  fromRow,
  toCol,
  toRow,
  color,
  panX,
  panY,
}: {
  fromCol: number;
  fromRow: number;
  toCol: number;
  toRow: number;
  color: ColorId;
  panX: number;
  panY: number;
}): React.ReactElement {
  const [fx, fy] = cellXY(fromCol, fromRow);
  const [tx, ty] = cellXY(toCol, toRow);
  const col = COLORS[color];
  const r = R - 4;
  return (
    <g style={{ filter: `drop-shadow(0 0 8px ${col?.glow ?? "#fff"})` }}>
      <animateTransform
        attributeName="transform"
        type="translate"
        from={`${String(fx + panX)} ${String(fy + panY)}`}
        to={`${String(tx + panX)} ${String(ty + panY)}`}
        dur="0.12s"
        fill="freeze"
        calcMode="spline"
        keySplines="0.25 0.1 0.25 1"
        keyTimes="0;1"
      />
      <path d={sidePath(0, 0, r, SIDE_D)} fill={col?.side ?? "#888"} />
      <path d={rhp(0, 0, r)} fill={col?.top ?? "#ccc"} />
    </g>
  );
}

function toCellKey(r: number, c: number): CellKey {
  return `${String(r)},${String(c)}` as CellKey;
}

export default function HexStackGame({ onBack }: HexStackGameProps): React.ReactElement {
  const saved = loadGame();
  const [{ board: initBoardVal, cellMap: initCellMapVal }] = useState(() =>
    saved ? { board: saved.board, cellMap: new Map(saved.cellMap) } : initGame()
  );
  const [board, setBoard] = useState(initBoardVal);
  const [incoming, setIncoming] = useState<ReadonlyArray<Stack>>(() => {
    if (saved) return saved.incoming;
    const p = getProgression(0);
    return [rndStack(p), rndStack(p), rndStack(p)];
  });
  const [cellMap, setCellMap] = useState(initCellMapVal);
  const [points, setPoints] = useState(() => saved?.points ?? 0);
  const [cleared, setCleared] = useState(() => saved?.cleared ?? 0);
  const [combo, setCombo] = useState(() => saved?.combo ?? 0);
  const [moveCount, setMoveCount] = useState(() => saved?.moveCount ?? 0);
  const [popups, setPopups] = useState<ReadonlyArray<Popup>>([]);
  const [glowing, setGlowing] = useState<ReadonlySet<string>>(new Set());
  const [newUnlocks, setNewUnlocks] = useState<ReadonlySet<string>>(new Set());
  const [lastTransferred, setLastTransferred] = useState<ReadonlySet<string>>(new Set());
  const [isAnimating, setIsAnim] = useState(false);
  const [flyHex, setFlyHex] = useState<FlyHexState | null>(null);
  const [dragging, setDragging] = useState<DraggingState | null>(null);
  const [panning, setPanning] = useState(false);
  const [panOffset, setPanOffset] = useState(INIT_PAN);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [dropHL, setDropHL] = useState<readonly [number, number] | null>(null);
  const [history, setHistory] = useState<ReadonlyArray<ReturnType<typeof makeSnap>>>([]);
  const [gameOver, setGameOver] = useState(false);
  const [cantAffordKey, setCantAfford] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ToolType | null>(null);
  const [swapFirst, setSwapFirst] = useState<readonly [number, number] | null>(null);
  const [actionUsages, setActionUsages] = useState(
    () => saved?.actionUsages ?? { swap: 0, bubble: 0, trim: 0 }
  );
  const [newColorBanner, setNewColorBanner] = useState<string | null>(null);
  const [resumeBanner, setResumeBanner] = useState(() => saved !== null);
  const [lastMoveInfo, setLastMoveInfo] = useState<LastMoveInfo | null>(null);
  const [, setCheatTaps] = useState([0, 0, 0]);
  const [cheatUnlocked, setCheatUnlocked] = useState(false);

  const boardSvgRef = useRef<SVGSVGElement>(null);
  const cardRefs = useRef<Array<SVGGElement | null>>([null, null, null]);
  const live = useRef({} as LiveState);
  const panStart = useRef<PanStart | null>(null);
  const clickStart = useRef<ClickStart | null>(null);
  const pendingPreStacks = useRef<Array<{ r: number; c: number; stack: Stack }>>([]);
  const cbRef = useRef({} as CbRef);

  live.current = {
    board,
    incoming,
    cellMap,
    points,
    cleared,
    moveCount,
    combo,
    isAnimating,
    dragging,
    panning,
    panOffset,
    history,
    gameOver,
    activeTool,
    lastTransferred,
  };

  function buildLastMoveInfo(
    steps: ReadonlyArray<Step>,
    nc: number,
    emptiedCount: number,
    newCombo: number,
    eMult: number,
    tBonus: number
  ): LastMoveInfo {
    const clearPtsTotal =
      nc > 0
        ? steps
            .filter((s) => s.type === "clear")
            .reduce((sum, s) => sum + Math.round(s.clearPtsBase * comboMult(newCombo)), 0)
        : 0;
    const applyEMult = nc > 0 && emptiedCount > 0;
    const bonus = applyEMult ? Math.round(clearPtsTotal * (eMult - 1)) : tBonus;
    return {
      total: clearPtsTotal + bonus,
      combo: newCombo,
      eMult: applyEMult ? eMult : 1,
      tBonus: applyEMult ? 0 : tBonus,
    };
  }

  // Auto-dismiss resume banner after 2 seconds
  useEffect(() => {
    if (!resumeBanner) return;
    const t = setTimeout(() => {
      setResumeBanner(false);
    }, 2000);
    return () => {
      clearTimeout(t);
    };
  }, [resumeBanner]);

  // Auto-save after each game state change (not during animation or after game over)
  useEffect(() => {
    if (isAnimating || gameOver) return;
    saveGame({
      board,
      incoming,
      cellMap: [...cellMap.entries()],
      points,
      cleared,
      moveCount,
      combo,
      actionUsages,
    });
  }, [
    board,
    incoming,
    cellMap,
    points,
    cleared,
    moveCount,
    combo,
    actionUsages,
    isAnimating,
    gameOver,
  ]);

  // Which locked cells are "ready"
  const readyCells = useMemo(() => {
    const s = new Set<CellKey>();
    cellMap.forEach((_, k) => {
      if (isCellReady(k, cellMap, board, lastTransferred)) s.add(k);
    });
    return s;
  }, [cellMap, board, lastTransferred]);

  useEffect(() => {
    const { cellMap: cm } = live.current;
    const newMap = new Map(cm);
    const keysToMark: CellKey[] = [];
    readyCells.forEach((k) => {
      const cell = newMap.get(k);
      if (cell?.state === "locked" && !cell.everReady) keysToMark.push(k);
    });
    if (keysToMark.length === 0) return;
    keysToMark.forEach((k) => {
      const cell = newMap.get(k);
      if (cell?.state === "locked") newMap.set(k, { ...cell, everReady: true });
    });
    setCellMap(newMap);
  }, [readyCells]);

  // Auto-unlock cells when points threshold is reached
  useEffect(() => {
    const {
      cellMap: cm,
      board: b,
      moveCount: mc,
      lastTransferred: lt,
      isAnimating: anim,
      combo: cmb,
    } = live.current;
    if (anim) return;
    function isReady(row: number, col: number): boolean {
      return isCellReady(toCellKey(row, col), cm, b, lt);
    }
    const toUnlock: Array<{ k: CellKey; cell: CellState; r: number; c: number }> = [];
    cm.forEach((cell, k) => {
      if (cell.state === "locked" && cell.autoUnlock != null && points >= cell.autoUnlock) {
        const [rStr, cStr] = k.split(",");
        const r = Number(rStr);
        const c = Number(cStr);
        if (isReady(r, c)) toUnlock.push({ k, cell, r, c });
      }
    });
    if (!toUnlock.length) return;
    const newMap = new Map(cm);
    const unlockKeys = new Set<string>();
    const prog = getProgression(mc);
    const newBoard = copyBoard(b);
    toUnlock.forEach(({ k, cell, r, c }) => {
      newMap.set(k, { state: "unlocked", cost: 0, wave: cell.wave });
      unlockKeys.add(k);
      revealNeighbors(newMap, r, c, cell.wave, prog);
      if (cell.state === "locked" && cell.preStack && cell.preStack.length > 0) {
        const row = newBoard[r];
        if (row) {
          row[c] = [...cell.preStack];
        }
      }
    });

    // Run BFS cascade for every newly placed preStack, chaining boards
    let cascadedBoard: Board = newBoard;
    let newCombo = cmb;
    let extraPoints = 0;
    const allCascadeSteps: Step[] = [];
    toUnlock.forEach(({ cell, r, c }) => {
      if (cell.state !== "locked" || !cell.preStack || cell.preStack.length === 0) return;
      const { steps, finalBoard, totalCleared } = computeSteps(cascadedBoard, r, c, []);
      allCascadeSteps.push(...steps);
      cascadedBoard = finalBoard;
      if (totalCleared > 0) {
        newCombo += 1;
        extraPoints += steps
          .filter((s) => s.type === "clear")
          .reduce((sum, s) => sum + Math.round(s.clearPtsBase * comboMult(newCombo)), 0);
      }
    });
    if (allCascadeSteps.length > 0) {
      applyLastTransferred(allCascadeSteps);
      setCombo(newCombo);
      if (extraPoints > 0) setPoints((p) => p + extraPoints);
    }

    setCellMap(newMap);
    setBoard(cascadedBoard);
    setNewUnlocks(unlockKeys);
    setTimeout(() => {
      setNewUnlocks(new Set());
    }, 800);
  }, [points, isAnimating]);

  useEffect(() => {
    const prev = getProgression(Math.max(0, moveCount - 1));
    const curr = getProgression(moveCount);
    if (curr.nc > prev.nc) {
      setNewColorBanner(COLORS[curr.nc - 1]?.label ?? null);
      setTimeout(() => {
        setNewColorBanner(null);
      }, 2500);
    }
  }, [moveCount]);

  // Z-sorted cells
  const cellsByY = useMemo(() => {
    const arr: Array<{ row: number; col: number; cy: number; key: CellKey }> = [];
    cellMap.forEach((_, k) => {
      const [rStr, cStr] = k.split(",");
      const row = Number(rStr);
      const col = Number(cStr);
      const [, cy] = cellXY(col, row);
      arr.push({ row, col, cy, key: k });
    });
    return arr.sort((a, b) => a.cy - b.cy);
  }, [cellMap]);

  function clientToEmptyCell(cx: number, cy: number): readonly [number, number] | null {
    const el = boardSvgRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const {
      panOffset: { x: ox, y: oy },
      cellMap: cm,
      board: b,
    } = live.current;
    const sx = cx - rect.left - ox;
    const sy = cy - rect.top - oy;
    let best: readonly [number, number] | null = null;
    let bestD = Infinity;
    cm.forEach((cell, k) => {
      if (cell.state !== "unlocked") return;
      const parts = k.split(",");
      const r = Number(parts[0]);
      const c = Number(parts[1]);
      if ((b[r]?.[c]?.length ?? 0) > 0) return;
      const [hx, hy] = cellXY(c, r);
      const d = Math.hypot(sx - hx, sy - hy);
      if (d < bestD) {
        bestD = d;
        best = [r, c];
      }
    });
    return bestD < R * 1.2 ? best : null;
  }

  function clientToCellAny(
    cx: number,
    cy: number
  ): { row: number; col: number; key: CellKey; cell: CellState } | null {
    const el = boardSvgRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const {
      panOffset: { x: ox, y: oy },
      cellMap: cm,
    } = live.current;
    const sx = cx - rect.left - ox;
    const sy = cy - rect.top - oy;
    let best: { row: number; col: number; key: CellKey; cell: CellState } | null = null;
    let bestD = Infinity;
    cm.forEach((cell, k) => {
      const parts = k.split(",");
      const r = Number(parts[0]);
      const c = Number(parts[1]);
      const [hx, hy] = cellXY(c, r);
      const d = Math.hypot(sx - hx, sy - hy);
      if (d < bestD) {
        bestD = d;
        best = { row: r, col: c, key: k, cell };
      }
    });
    return bestD < R * 1.2 ? best : null;
  }

  function applyLastTransferred(steps: ReadonlyArray<Step>): void {
    const s = new Set<string>();
    steps.forEach((st) => {
      if (st.type === "transfer") s.add(`${String(st.to[0])},${String(st.to[1])}`);
    });
    setLastTransferred(s);
  }

  function checkGameOver(boardState: Board, cmState: CellMap): void {
    const hasEmpty = [...cmState.entries()].some(([k, cell]) => {
      if (cell.state !== "unlocked") return false;
      const [rStr, cStr] = k.split(",");
      const r = Number(rStr);
      const c = Number(cStr);
      return (boardState[r]?.[c]?.length ?? 0) === 0;
    });
    if (!hasEmpty) setGameOver(true);
  }

  // Animation engine
  type PlayFn = (
    steps: ReadonlyArray<Step>,
    idx: number,
    finalBoard: Board,
    finalCm: CellMap,
    comboVal: number,
    bonusInfo: Popup | null
  ) => void;
  const playRef = useRef<PlayFn | null>(null);

  playRef.current = function play(steps, idx, finalBoard, finalCm, comboVal, bonusInfo) {
    if (idx >= steps.length) {
      setIsAnim(false);
      setFlyHex(null);
      let committed: Board = finalBoard;
      if (pendingPreStacks.current.length > 0) {
        const mutableBoard = copyBoard(finalBoard);
        pendingPreStacks.current.forEach(({ r, c, stack }) => {
          const row = mutableBoard[r];
          if (row && (row[c]?.length ?? 0) === 0) row[c] = [...stack];
        });
        pendingPreStacks.current = [];
        committed = mutableBoard;
      }
      setBoard(committed);
      if (bonusInfo && (bonusInfo.pts ?? 0) > 0) {
        const id = Date.now() + Math.random();
        setPopups((p) => [...p, { ...bonusInfo, id }]);
        setTimeout(() => {
          setPopups((p) => p.filter((x) => x.id !== id));
        }, 1800);
      }
      checkGameOver(committed, finalCm);
      return;
    }
    const s = steps[idx];
    if (!s) return;
    const next = () => playRef.current?.(steps, idx + 1, finalBoard, finalCm, comboVal, bonusInfo);
    if (s.type === "transfer") {
      setBoard(s.before);
      setFlyHex({
        fromCol: s.from[1],
        fromRow: s.from[0],
        toCol: s.to[1],
        toRow: s.to[0],
        color: s.color,
        key: idx,
      });
      setTimeout(() => {
        setBoard(s.after);
        setFlyHex(null);
        setTimeout(next, 20);
      }, 120);
    } else {
      setBoard(s.before);
      const gk = `${String(s.at[0])}-${String(s.at[1])}`;
      setGlowing((p) => new Set([...p, gk]));
      const inlinePts = Math.round(s.clearPtsBase * comboMult(comboVal));
      setPoints((p) => p + inlinePts);
      setCleared((c) => c + s.count);
      const id = Date.now() + Math.random();
      setPopups((p) => [
        ...p,
        {
          id,
          x: s.popX,
          y: s.popY,
          pts: inlinePts,
          combo: comboVal >= 2 ? comboVal : 0,
          small: true,
        },
      ]);
      setTimeout(() => {
        setPopups((p) => p.filter((x) => x.id !== id));
      }, 1200);
      setTimeout(() => {
        setBoard(s.after);
        setGlowing((p) => {
          const n = new Set(p);
          n.delete(gk);
          return n;
        });
        setTimeout(next, 30);
      }, 200);
    }
  };

  function tryUnlock(key: CellKey, cell: CellState): void {
    const {
      points: pts,
      cellMap: cm,
      board: b,
      history: hist,
      cleared: clr,
      moveCount: mc,
      incoming: inc,
      combo: cmb,
      lastTransferred: lt,
    } = live.current;
    if (cell.state !== "locked" || cell.autoUnlock != null) return;
    if (!isCellReady(key, cm, b, lt)) return;
    const [rStr, cStr] = key.split(",");
    const r = Number(rStr);
    const c = Number(cStr);
    if (pts < cell.cost) {
      setCantAfford(key);
      setTimeout(() => {
        setCantAfford(null);
      }, 500);
      return;
    }
    setHistory([...hist, makeSnap(b, inc, cm, pts, clr, mc, cmb)].slice(-5));
    const newPts = pts - cell.cost;
    const newMap = new Map(cm);
    newMap.set(key, { state: "unlocked", cost: 0, wave: cell.wave });
    const prog = getProgression(mc);
    revealNeighbors(newMap, r, c, cell.wave, prog);
    setCellMap(newMap);
    setPoints(newPts);
    setNewUnlocks(new Set([key]));
    setTimeout(() => {
      setNewUnlocks(new Set());
    }, 700);

    if (cell.preStack && cell.preStack.length > 0) {
      const {
        steps,
        finalBoard,
        totalCleared: nc,
        transferCount,
        emptiedCount,
      } = computeSteps(b, r, c, cell.preStack);
      applyLastTransferred(steps);
      const newCombo = nc > 0 ? cmb + 1 : 0;
      setCombo(newCombo);
      const tBonus = transferBonus(transferCount);
      const eMult = emptyMult(emptiedCount);
      const [px, py] = cellXY(c, r);
      let bonusInfo: Popup | null = null;
      if (nc > 0 && emptiedCount > 0) {
        const totalBase = steps
          .filter((s) => s.type === "clear")
          .reduce((sum, s) => sum + Math.round(s.clearPtsBase * comboMult(newCombo)), 0);
        const extra = Math.round(totalBase * (eMult - 1));
        if (extra > 0) {
          bonusInfo = {
            id: Date.now(),
            x: px,
            y: py - 30,
            pts: extra,
            label: `×${String(eMult)}`,
            type: "mult",
          };
          setTimeout(
            () => {
              setPoints((p) => p + extra);
            },
            steps.length * (120 + 20) + 300
          );
        }
      } else if (tBonus > 0) {
        bonusInfo = {
          id: Date.now(),
          x: px,
          y: py - 30,
          pts: tBonus,
          label: `+${String(tBonus)} bonus`,
          type: "transfer",
        };
        setTimeout(
          () => {
            setPoints((p) => p + tBonus);
          },
          steps.length * (120 + 20) + 200
        );
      }
      if (!steps.length) {
        setBoard(finalBoard);
        if (tBonus > 0) setPoints((p) => p + tBonus);
        checkGameOver(finalBoard, newMap);
      } else {
        setBoard(steps[0]?.before ?? finalBoard);
        setIsAnim(true);
        playRef.current?.(steps, 0, finalBoard, newMap, newCombo, bonusInfo);
      }
    } else {
      checkGameOver(b, newMap);
    }
  }

  function triggerPlace(stackIdx: number, row: number, col: number): void {
    const {
      board: b,
      incoming: inc,
      isAnimating: anim,
      cellMap: cm,
      points: pts,
      cleared: clr,
      history: hist,
      moveCount: mc,
      combo: cmb,
    } = live.current;
    if (anim || gameOver) return;
    const info = cm.get(toCellKey(row, col));
    if (!info || info.state !== "unlocked" || (b[row]?.[col]?.length ?? 0) > 0) return;

    const newMc = mc + 1;
    setHistory([...hist, makeSnap(b, inc, cm, pts, clr, mc, cmb)].slice(-5));

    const stack = inc[stackIdx];
    if (!stack) return;

    const {
      steps,
      finalBoard,
      totalCleared: nc,
      transferCount,
      emptiedCount,
    } = computeSteps(b, row, col, stack);

    applyLastTransferred(steps);

    const newProg = getProgression(newMc);
    const ni = [...inc];
    ni[stackIdx] = rndStack(newProg);
    setIncoming(ni);
    setMoveCount(newMc);

    const newCombo = nc > 0 ? cmb + 1 : 0;
    setCombo(newCombo);

    const tBonus = transferBonus(transferCount);
    const eMult = emptyMult(emptiedCount);
    setLastMoveInfo(buildLastMoveInfo(steps, nc, emptiedCount, newCombo, eMult, tBonus));
    const [px, py] = cellXY(col, row);
    let bonusInfo: Popup | null = null;

    if (nc > 0) {
      if (emptiedCount > 0) {
        const totalBase = steps
          .filter((s) => s.type === "clear")
          .reduce((sum, s) => sum + Math.round(s.clearPtsBase * comboMult(newCombo)), 0);
        const extra = Math.round(totalBase * (eMult - 1));
        if (extra > 0) {
          bonusInfo = {
            id: Date.now(),
            x: px,
            y: py - 30,
            pts: extra,
            label: `×${String(eMult)}`,
            type: "mult",
          };
        }
      } else if (tBonus > 0) {
        bonusInfo = {
          id: Date.now(),
          x: px,
          y: py - 30,
          pts: tBonus,
          label: `+${String(tBonus)} bonus`,
          type: "transfer",
        };
      }
      if (bonusInfo) {
        const capturedBonus = bonusInfo;
        setTimeout(
          () => {
            setPoints((p) => p + (capturedBonus.pts ?? 0));
          },
          steps.length * (120 + 20) + 300
        );
      }
    } else if (tBonus > 0) {
      bonusInfo = {
        id: Date.now(),
        x: px,
        y: py - 30,
        pts: tBonus,
        label: `+${String(tBonus)} bonus`,
        type: "transfer",
      };
      setTimeout(
        () => {
          setPoints((p) => p + tBonus);
        },
        steps.length * (120 + 20) + 100
      );
    }

    if (!steps.length) {
      setBoard(finalBoard);
      if (tBonus > 0) {
        setPoints((p) => p + tBonus);
        const id = Date.now() + Math.random();
        setPopups((p) => [
          ...p,
          { id, x: px, y: py, pts: tBonus, label: `+${String(tBonus)} bonus`, type: "transfer" },
        ]);
        setTimeout(() => {
          setPopups((p) => p.filter((x) => x.id !== id));
        }, 1400);
      }
      checkGameOver(finalBoard, cm);
      return;
    }
    setBoard(steps[0]?.before ?? finalBoard);
    setIsAnim(true);
    playRef.current?.(steps, 0, finalBoard, cm, newCombo, bonusInfo);
  }

  function undo(): void {
    const { history: hist, isAnimating: anim, points: pts } = live.current;
    if (!hist.length || anim || pts < UNDO_COST) return;
    const prev = hist[hist.length - 1];
    if (!prev) return;
    setBoard(prev.board);
    setIncoming(prev.incoming);
    setCellMap(prev.cellMap);
    setPoints(prev.points - UNDO_COST);
    setCleared(prev.cleared);
    setMoveCount(prev.moveCount);
    setCombo(prev.combo);
    setHistory(hist.slice(0, -1));
    setGameOver(false);
    setFlyHex(null);
    setGlowing(new Set());
    setPopups([]);
    setLastMoveInfo(null);
  }

  // Action tools
  const ACTIONS: Record<
    ToolType,
    { readonly base: number; readonly label: string; readonly cost: number }
  > = {
    swap: {
      base: 100,
      label: "⇄ Swap",
      get cost() {
        return 100 + actionUsages.swap * 50;
      },
    },
    bubble: {
      base: 80,
      label: "↓ Bubble",
      get cost() {
        return 80 + actionUsages.bubble * 50;
      },
    },
    trim: {
      base: 150,
      label: "✂ Trim",
      get cost() {
        return 150 + actionUsages.trim * 50;
      },
    },
  };

  function canUseTool(name: ToolType): boolean {
    return !isAnimating && !gameOver && !dragging && points >= ACTIONS[name].cost;
  }

  function selectTool(name: ToolType): void {
    if (activeTool === name) {
      setActiveTool(null);
      setSwapFirst(null);
      return;
    }
    setActiveTool(name);
    setSwapFirst(null);
  }

  function runActionCascade(
    nb: Board,
    startCells: ReadonlyArray<readonly [number, number]>,
    actionCostVal: number,
    toolName: ToolType
  ): void {
    const { points: pts, cleared: clr, moveCount: mc, combo: cmb, cellMap: cm } = live.current;
    setHistory((h) => [...h, makeSnap(board, incoming, cm, pts, clr, mc, cmb)].slice(-5));
    setPoints((p) => p - actionCostVal);
    setActiveTool(null);
    setSwapFirst(null);
    setActionUsages((u) => ({ ...u, [toolName]: u[toolName] + 1 }));

    let currentBoard: Board = nb;
    let allSteps: ReadonlyArray<Step> = [];
    let totalCleared = 0,
      transferCount = 0,
      emptiedCount = 0;

    for (const [row, col] of startCells) {
      if ((currentBoard[row]?.[col]?.length ?? 0) === 0) continue;
      const {
        steps,
        finalBoard,
        totalCleared: nc,
        transferCount: tc,
        emptiedCount: ec,
      } = computeSteps(currentBoard, row, col, []);
      allSteps = [...allSteps, ...steps];
      currentBoard = finalBoard;
      totalCleared += nc;
      transferCount += tc;
      emptiedCount += ec;
    }

    const finalBoard = currentBoard;
    applyLastTransferred(allSteps);
    const newCombo = totalCleared > 0 ? cmb + 1 : 0;
    setCombo(newCombo);

    const tBonus = transferBonus(transferCount);
    const eMult = emptyMult(emptiedCount);
    setLastMoveInfo(
      buildLastMoveInfo(allSteps, totalCleared, emptiedCount, newCombo, eMult, tBonus)
    );
    const firstCell = startCells[0];
    const [px, py] = firstCell ? cellXY(firstCell[1], firstCell[0]) : [0, 0];
    let bonusInfo: Popup | null = null;

    if (totalCleared > 0) {
      if (emptiedCount > 0) {
        const totalBase = allSteps
          .filter((s) => s.type === "clear")
          .reduce((sum, s) => sum + Math.round(s.clearPtsBase * comboMult(newCombo)), 0);
        const extra = Math.round(totalBase * (eMult - 1));
        if (extra > 0) {
          bonusInfo = {
            id: Date.now(),
            x: px,
            y: py - 30,
            pts: extra,
            label: `×${String(eMult)}`,
            type: "mult",
          };
          setTimeout(
            () => {
              setPoints((p) => p + extra);
            },
            allSteps.length * (120 + 20) + 300
          );
        }
      } else if (tBonus > 0) {
        bonusInfo = {
          id: Date.now(),
          x: px,
          y: py - 30,
          pts: tBonus,
          label: `+${String(tBonus)} bonus`,
          type: "transfer",
        };
        setTimeout(
          () => {
            setPoints((p) => p + tBonus);
          },
          allSteps.length * (120 + 20) + 200
        );
      }
    } else if (tBonus > 0) {
      bonusInfo = {
        id: Date.now(),
        x: px,
        y: py - 30,
        pts: tBonus,
        label: `+${String(tBonus)} bonus`,
        type: "transfer",
      };
      setTimeout(
        () => {
          setPoints((p) => p + tBonus);
        },
        allSteps.length * (120 + 20) + 100
      );
    }

    if (!allSteps.length) {
      setBoard(finalBoard);
      if (tBonus > 0 && totalCleared === 0) {
        setPoints((p) => p + tBonus);
        const id = Date.now() + Math.random();
        setPopups((p) => [
          ...p,
          { id, x: px, y: py, pts: tBonus, label: `+${String(tBonus)} bonus`, type: "transfer" },
        ]);
        setTimeout(() => {
          setPopups((p) => p.filter((x) => x.id !== id));
        }, 1400);
      }
      checkGameOver(finalBoard, cm);
    } else {
      setBoard(allSteps[0]?.before ?? finalBoard);
      setIsAnim(true);
      playRef.current?.(allSteps, 0, finalBoard, cm, newCombo, bonusInfo);
    }
  }

  function applyBubble(row: number, col: number): void {
    const stack = [...(board[row]?.[col] ?? [])];
    if (stack.length < 2) return;
    const topC = stack[stack.length - 1];
    if (topC === undefined) return;
    let topStart = stack.length - 1;
    while (topStart > 0 && stack[topStart - 1] === topC) topStart--;
    if (topStart === 0) return;
    const secC = stack[topStart - 1];
    if (secC === undefined) return;
    let secStart = topStart - 1;
    while (secStart > 0 && stack[secStart - 1] === secC) secStart--;
    const topBlock = stack.splice(topStart, stack.length - topStart);
    const secBlock = stack.splice(secStart, topStart - secStart);
    const nb = copyBoard(board);
    const nbRow = nb[row];
    if (nbRow) nbRow[col] = [...stack, ...topBlock, ...secBlock];
    runActionCascade(nb, [[row, col]], ACTIONS.bubble.cost, "bubble");
  }

  function applyTrim(row: number, col: number): void {
    const stack = [...(board[row]?.[col] ?? [])];
    if (!stack.length) return;
    const topC = stack[stack.length - 1];
    if (topC === undefined) return;
    let i = stack.length - 1;
    while (i >= 0 && stack[i] === topC) i--;
    const nb = copyBoard(board);
    const nbRow = nb[row];
    if (nbRow) nbRow[col] = stack.slice(0, i + 1);
    runActionCascade(nb, [[row, col]], ACTIONS.trim.cost, "trim");
  }

  function applySwap(r1: number, c1: number, r2: number, c2: number): void {
    const nb = copyBoard(board);
    const row1 = nb[r1];
    const row2 = nb[r2];
    if (row1 && row2) {
      const tmp = row1[c1];
      const tmp2 = row2[c2];
      if (tmp !== undefined && tmp2 !== undefined) {
        row1[c1] = tmp2;
        row2[c2] = tmp;
      }
    }
    runActionCascade(
      nb,
      [
        [r1, c1],
        [r2, c2],
      ],
      ACTIONS.swap.cost,
      "swap"
    );
  }

  function handleToolClick(row: number, col: number): boolean {
    if (!activeTool) return false;
    const stack = board[row]?.[col] ?? [];
    const info = cellMap.get(toCellKey(row, col));
    if (!info || info.state !== "unlocked") return true;
    if (activeTool === "bubble" && stack.length >= 2) {
      applyBubble(row, col);
      return true;
    }
    if (activeTool === "trim" && stack.length >= 1) {
      applyTrim(row, col);
      return true;
    }
    if (activeTool === "swap") {
      if (!swapFirst) {
        setSwapFirst([row, col]);
        return true;
      }
      const [r1, c1] = swapFirst;
      if (r1 === row && c1 === col) {
        setSwapFirst(null);
        return true;
      }
      applySwap(r1, c1, row, col);
      return true;
    }
    return true;
  }

  function handleCheatTap(i: number): void {
    setCheatTaps((prev) => {
      const next = [...prev];
      next[i] = (next[i] ?? 0) + 1;
      if ((next[0] ?? 0) >= 1 && (next[1] ?? 0) >= 2 && (next[2] ?? 0) >= 3) {
        if ((next[0] ?? 0) === 1 && (next[1] ?? 0) === 2 && (next[2] ?? 0) === 3) {
          setCheatUnlocked(true);
          return [0, 0, 0];
        }
        return [0, 0, 0];
      }
      if (i === 0 && (next[1] ?? 0) > 0) return [1, 0, 0];
      if (i === 1 && (next[0] ?? 0) < 1) return [0, 0, 0];
      if (i === 2 && (next[1] ?? 0) < 2) return [0, 0, 0];
      return next;
    });
  }

  function reset(): void {
    const p = getProgression(0);
    const g = initGame();
    setBoard(g.board);
    setIncoming([rndStack(p), rndStack(p), rndStack(p)]);
    setCellMap(g.cellMap);
    setPoints(0);
    setCleared(0);
    setMoveCount(0);
    setCombo(0);
    setPopups([]);
    setGlowing(new Set());
    setNewUnlocks(new Set());
    setDragging(null);
    setDropHL(null);
    setFlyHex(null);
    setIsAnim(false);
    setPanning(false);
    setPanOffset(INIT_PAN);
    setHistory([]);
    setGameOver(false);
    setCantAfford(null);
    setNewColorBanner(null);
    setActionUsages({ swap: 0, bubble: 0, trim: 0 });
    setLastMoveInfo(null);
    clearSave();
    panStart.current = null;
    clickStart.current = null;
  }

  // Callbacks
  cbRef.current = {
    dragMove(cx: number, cy: number) {
      setDragPos({ x: cx, y: cy });
      setDropHL(clientToEmptyCell(cx, cy));
    },
    dragEnd(cx: number, cy: number) {
      const { dragging: d, isAnimating: a } = live.current;
      setDragging(null);
      setDropHL(null);
      if (!d || a) return;
      const cell = clientToEmptyCell(cx, cy);
      if (cell) triggerPlace(d.idx, cell[0], cell[1]);
    },
    panMove(cx: number, cy: number) {
      if (!panStart.current) return;
      const { cx: sx, cy: sy, ox, oy } = panStart.current;
      setPanOffset({ x: ox + (cx - sx), y: oy + (cy - sy) });
    },
    panEnd(cx: number, cy: number) {
      if (clickStart.current && !live.current.dragging) {
        const { x, y } = clickStart.current;
        if (Math.hypot(cx - x, cy - y) < 8 && !live.current.isAnimating) {
          const hit = clientToCellAny(cx, cy);
          if (hit) {
            if (activeTool && handleToolClick(hit.row, hit.col)) {
              /* handled */
            } else if (hit.cell.state === "locked") tryUnlock(hit.key, hit.cell);
          }
        }
      }
      clickStart.current = null;
      setPanning(false);
      panStart.current = null;
    },
  };

  // Mouse handlers
  useEffect(() => {
    if (!dragging && !panning) return;
    const mv = (e: MouseEvent) => {
      if (live.current.dragging) cbRef.current.dragMove(e.clientX, e.clientY);
      else if (live.current.panning) cbRef.current.panMove(e.clientX, e.clientY);
    };
    const up = (e: MouseEvent) => {
      if (live.current.dragging) cbRef.current.dragEnd(e.clientX, e.clientY);
      else cbRef.current.panEnd(e.clientX, e.clientY);
    };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", mv);
      window.removeEventListener("mouseup", up);
    };
  }, [dragging, panning]);

  // Touch: cards
  useEffect(() => {
    const cls = [0, 1, 2].map((i) => {
      const el = cardRefs.current[i];
      if (!el)
        return () => {
          /* no-op */
        };
      const ts = (e: TouchEvent) => {
        if (live.current.isAnimating || live.current.gameOver) return;
        e.preventDefault();
        e.stopPropagation();
        handleCheatTap(i);
        setActiveTool(null);
        setSwapFirst(null);
        const t = e.touches[0];
        if (!t) return;
        setDragging({ idx: i });
        setDragPos({ x: t.clientX, y: t.clientY });
      };
      const tm = (e: TouchEvent) => {
        e.preventDefault();
        const t = e.touches[0];
        if (!t) return;
        cbRef.current.dragMove(t.clientX, t.clientY);
      };
      const te = (e: TouchEvent) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        if (!t) return;
        cbRef.current.dragEnd(t.clientX, t.clientY);
      };
      el.addEventListener("touchstart", ts, { passive: false });
      el.addEventListener("touchmove", tm, { passive: false });
      el.addEventListener("touchend", te, { passive: false });
      return () => {
        el.removeEventListener("touchstart", ts);
        el.removeEventListener("touchmove", tm);
        el.removeEventListener("touchend", te);
      };
    });
    return () => {
      cls.forEach((fn) => {
        fn();
      });
    };
  }, []);

  // Touch: board
  useEffect(() => {
    const el = boardSvgRef.current;
    if (!el) return;
    const ts = (e: TouchEvent) => {
      if (live.current.isAnimating || live.current.dragging) return;
      e.preventDefault();
      const t = e.touches[0];
      if (!t) return;
      const {
        panOffset: { x: ox, y: oy },
      } = live.current;
      clickStart.current = { x: t.clientX, y: t.clientY };
      setPanning(true);
      panStart.current = { cx: t.clientX, cy: t.clientY, ox, oy };
    };
    const tm = (e: TouchEvent) => {
      if (!live.current.panning) return;
      e.preventDefault();
      const t = e.touches[0];
      if (!t) return;
      cbRef.current.panMove(t.clientX, t.clientY);
    };
    const te = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (!t) return;
      cbRef.current.panEnd(t.clientX, t.clientY);
    };
    el.addEventListener("touchstart", ts, { passive: false });
    el.addEventListener("touchmove", tm, { passive: false });
    el.addEventListener("touchend", te, { passive: false });
    return () => {
      el.removeEventListener("touchstart", ts);
      el.removeEventListener("touchmove", tm);
      el.removeEventListener("touchend", te);
    };
  }, []);

  // Derived state
  const dragActive = !!dragging && !isAnimating && !gameOver;
  const draggedStack = dragging && dragActive ? incoming[dragging.idx] : null;
  const selTop = draggedStack ? topOf(draggedStack) : null;
  const donors = new Set<string>(
    selTop !== null && dropHL
      ? getNeighbors(dropHL[0], dropHL[1])
          .filter(([r, c]) => {
            const info = cellMap.get(toCellKey(r, c));
            return info?.state === "unlocked" && topOf(board[r]?.[c] ?? []) === selTop;
          })
          .map(([r, c]) => `${String(r)}-${String(c)}`)
      : []
  );

  const canUndo = history.length > 0 && !isAnimating && points >= UNDO_COST;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        minHeight: "100vh",
        background: "linear-gradient(160deg,#c5e5f8 0%,#d8eef8 50%,#b5d5ec 100%)",
        color: "#1a4060",
        fontFamily: "system-ui,sans-serif",
        paddingBottom: 16,
        userSelect: "none",
      }}
    >
      {/* Header */}
      <div
        style={{
          textAlign: "center",
          padding: "10px 0 2px",
          zIndex: 20,
          position: "relative",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <button
          onClick={onBack}
          style={{
            position: "absolute",
            left: 12,
            background: "rgba(255,255,255,0.6)",
            border: "1px solid rgba(120,180,220,0.5)",
            color: "#4a90b8",
            borderRadius: 10,
            padding: "4px 12px",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          ← Liste
        </button>
        <h1
          style={{
            margin: 0,
            fontSize: 24,
            fontWeight: 900,
            letterSpacing: 3,
            color: "#1a6090",
            textShadow: "0 2px 8px rgba(100,180,255,0.3)",
          }}
        >
          HEX STACK
        </h1>
      </div>

      {/* Stats */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginBottom: 2,
          fontSize: 11,
          fontWeight: 600,
          zIndex: 20,
          position: "relative",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <span style={{ color: "#1a6090" }}>
          POINTS{" "}
          <span style={{ color: "#e07010", fontSize: 20, fontWeight: 900 }}>
            {points.toLocaleString()}
          </span>
        </span>
        <span style={{ color: "#9bbcd4" }}>|</span>
        <span style={{ color: "#1a6090" }}>
          EFFACÉ <span style={{ color: "#208040", fontSize: 18, fontWeight: 900 }}>{cleared}</span>
        </span>
        <span style={{ color: "#9bbcd4" }}>|</span>
        <span style={{ color: "#9bbcd4", fontSize: 10 }}>{moveCount} coups</span>
      </div>

      {/* Last move result */}
      <div
        style={{
          minHeight: 18,
          marginBottom: 2,
          fontSize: 11,
          fontWeight: 700,
          display: "flex",
          gap: 8,
          justifyContent: "center",
          alignItems: "center",
          zIndex: 20,
          position: "relative",
        }}
      >
        {lastMoveInfo && lastMoveInfo.total > 0 && (
          <>
            <span style={{ color: "#208040" }}>+{lastMoveInfo.total.toLocaleString()} pts</span>
            {lastMoveInfo.combo >= 2 && (
              <span
                style={{
                  color: lastMoveInfo.combo >= 3 ? "#e03050" : "#e07010",
                  textShadow: lastMoveInfo.combo >= 3 ? "0 0 6px rgba(224,48,80,0.4)" : "none",
                }}
              >
                ×{lastMoveInfo.combo} combo
              </span>
            )}
            {lastMoveInfo.eMult > 1 && (
              <span style={{ color: "#f1c40f" }}>×{lastMoveInfo.eMult} piles</span>
            )}
            {lastMoveInfo.tBonus > 0 && (
              <span style={{ color: "#2ecc71" }}>+{lastMoveInfo.tBonus} bonus</span>
            )}
          </>
        )}
      </div>

      {/* Resume banner */}
      {resumeBanner && (
        <div
          style={{
            position: "fixed",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(160,200,160,0.9)",
            color: "#1a4020",
            padding: "6px 16px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 700,
            zIndex: 100,
          }}
        >
          Partie reprise ✓
        </div>
      )}

      {/* New color banner */}
      {newColorBanner && (
        <div
          style={{
            position: "fixed",
            top: 60,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(30,60,100,0.9)",
            color: "white",
            padding: "8px 22px",
            borderRadius: 20,
            fontSize: 14,
            fontWeight: 700,
            zIndex: 100,
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            animation: "bannerPop 0.4s ease-out",
            letterSpacing: 1,
          }}
        >
          🎨 Nouvelle couleur : {newColorBanner} !
        </div>
      )}

      {/* Board */}
      <div
        style={{
          width: VIEWPORT_W,
          height: VIEWPORT_H,
          overflow: "hidden",
          borderRadius: 16,
          boxShadow: "0 4px 24px rgba(60,120,180,0.15)",
          position: "relative",
          flexShrink: 0,
        }}
      >
        <svg
          ref={boardSvgRef}
          width={VIEWPORT_W}
          height={VIEWPORT_H}
          style={{
            display: "block",
            touchAction: "none",
            cursor: panning ? "grabbing" : dragActive ? "crosshair" : "grab",
          }}
          onMouseDown={(e) => {
            if (live.current.isAnimating || live.current.dragging) return;
            const {
              panOffset: { x: ox, y: oy },
            } = live.current;
            clickStart.current = { x: e.clientX, y: e.clientY };
            setPanning(true);
            panStart.current = { cx: e.clientX, cy: e.clientY, ox, oy };
          }}
        >
          <HexDefs />

          <g transform={`translate(${String(panOffset.x)},${String(panOffset.y)})`}>
            {cellsByY.map(({ row, col, key }) => {
              const [cx, cy] = cellXY(col, row);
              const info = cellMap.get(key);
              const locked = info?.state !== "unlocked";
              const stack = locked ? [] : (board[row]?.[col] ?? []);
              const isDonor = donors.has(`${String(row)}-${String(col)}`);
              const isHL = !locked && dropHL !== null && dropHL[0] === row && dropHL[1] === col;
              const isGlow = glowing.has(`${String(row)}-${String(col)}`);
              const justUnlocked = newUnlocks.has(key);
              const shaking = cantAffordKey === key;
              const isReady = readyCells.has(key);
              const canAfford =
                locked &&
                info?.state === "locked" &&
                !info.autoUnlock &&
                isReady &&
                points >= info.cost;
              const isSwapFirst =
                swapFirst !== null && swapFirst[0] === row && swapFirst[1] === col;
              const isToolTarget =
                activeTool !== null &&
                !locked &&
                ((activeTool === "bubble" && stack.length >= 2) ||
                  (activeTool === "trim" && stack.length >= 1) ||
                  activeTool === "swap");

              return (
                <g
                  key={key}
                  style={
                    justUnlocked
                      ? { animation: "unlockPop 0.5s ease-out" }
                      : shaking
                        ? { animation: "cantAfford 0.35s ease-in-out" }
                        : undefined
                  }
                >
                  <FloorHex
                    cx={cx}
                    cy={cy}
                    locked={locked}
                    cost={info?.cost ?? 0}
                    {...(info?.state === "locked" && info.autoUnlock != null
                      ? { autoUnlock: info.autoUnlock }
                      : {})}
                    {...(info?.state === "locked" && info.preStack != null
                      ? { preStack: info.preStack }
                      : {})}
                    canAfford={canAfford}
                    isReady={isReady}
                    isHL={isHL}
                    isDonor={isDonor}
                    isGlow={isGlow}
                    isToolTarget={isToolTarget}
                    isSwapFirst={isSwapFirst}
                    dragActive={dragActive && !locked && stack.length === 0}
                    selTop={selTop}
                  />
                  {!locked && stack.length > 0 && <Stack3D stack={stack} cx={cx} cy={cy} />}
                </g>
              );
            })}

            {popups.map((p) => (
              <g key={p.id} style={{ pointerEvents: "none" }}>
                <text
                  x={p.x}
                  y={p.y - 20}
                  textAnchor="middle"
                  fill={
                    p.type === "mult"
                      ? "#f1c40f"
                      : p.type === "transfer"
                        ? "#2ecc71"
                        : (p.combo ?? 0) >= 3
                          ? "#e03050"
                          : "#e07010"
                  }
                  fontSize={p.type === "mult" || p.type === "transfer" ? 18 : p.small ? 13 : 17}
                  fontWeight={900}
                  style={{
                    animation: "popFloat 1.4s ease-out forwards",
                    filter: "drop-shadow(0 0 4px rgba(0,0,0,0.3))",
                  }}
                >
                  {p.type === "mult"
                    ? `×${p.label?.replace("×", "") ?? ""} +${String(p.pts ?? 0)}!`
                    : p.type === "transfer"
                      ? `+${String(p.pts ?? 0)} transfert!`
                      : (p.combo ?? 0) >= 2
                        ? `+${String(p.pts ?? 0)} ×${comboMult(p.combo ?? 0)
                            .toFixed(1)
                            .replace(".0", "")}!`
                        : `+${String(p.pts ?? 0)}!`}
                </text>
              </g>
            ))}
          </g>

          {flyHex && (
            <FlyHex
              key={flyHex.key}
              fromCol={flyHex.fromCol}
              fromRow={flyHex.fromRow}
              toCol={flyHex.toCol}
              toRow={flyHex.toRow}
              color={flyHex.color}
              panX={panOffset.x}
              panY={panOffset.y}
            />
          )}
        </svg>

        {gameOver && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 16,
              background: "rgba(10,30,60,0.78)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                fontSize: 28,
                fontWeight: 900,
                color: "white",
                letterSpacing: 2,
                textShadow: "0 2px 16px rgba(100,180,255,0.5)",
              }}
            >
              PARTIE TERMINÉE
            </div>
            <div style={{ fontSize: 14, color: "#a0d0f0" }}>Plus aucune case vide disponible</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#f1c40f" }}>
              {points.toLocaleString()} pts
            </div>
            <div style={{ fontSize: 13, color: "#80b8d8" }}>
              {cleared} hexagones effacés · {moveCount} coups
            </div>
            <button
              onClick={reset}
              style={{
                marginTop: 8,
                background: "rgba(255,255,255,0.15)",
                border: "2px solid rgba(255,255,255,0.4)",
                color: "white",
                borderRadius: 12,
                padding: "8px 28px",
                cursor: "pointer",
                fontSize: 14,
                letterSpacing: 2,
                fontWeight: 700,
              }}
            >
              REJOUER
            </button>
          </div>
        )}
      </div>

      {/* Incoming */}
      {!gameOver && (
        <div style={{ marginTop: 1 }}>
          <svg
            width={VIEWPORT_W}
            height={INC_H}
            overflow="visible"
            style={{ display: "block", touchAction: "none" }}
          >
            {incoming.map((stack, i) => {
              const cx = INC_CX[i] ?? 0;
              const cy = INC_CY;
              const isDragged = dragging?.idx === i;
              return (
                <g
                  key={i}
                  ref={(el) => {
                    cardRefs.current[i] = el;
                  }}
                  onMouseDown={(e) => {
                    handleCheatTap(i);
                    if (live.current.isAnimating) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setActiveTool(null);
                    setSwapFirst(null);
                    setDragging({ idx: i });
                    setDragPos({ x: e.clientX, y: e.clientY });
                  }}
                  style={{
                    cursor: isAnimating ? "default" : "grab",
                    opacity: isDragged ? 0.3 : isAnimating ? 0.5 : 1,
                    transition: "opacity 0.15s",
                    WebkitTouchCallout: "none",
                    WebkitUserSelect: "none",
                  }}
                >
                  <path
                    d={sidePath(cx, cy, R - 2, SIDE_D)}
                    fill={isDragged ? "#9cc4e4" : "#b8d4ea"}
                  />
                  <path
                    d={rhp(cx, cy, R - 2)}
                    fill={isDragged ? "#e4f2ff" : "#ddeef8"}
                    stroke={isDragged ? "#f1c40f" : "rgba(155,195,225,0.7)"}
                    strokeWidth={isDragged ? 2 : 0.7}
                  />
                  {stack.length > 0 && <Stack3D stack={stack} cx={cx} cy={cy} />}
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* Action tools + controls */}
      <div
        style={{
          marginTop: 6,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
        }}
      >
        {/* Tool buttons row */}
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {(["swap", "bubble", "trim"] as ToolType[]).map((name) => {
            const active = activeTool === name;
            const able = canUseTool(name);
            const cost = ACTIONS[name].cost;
            const label = ACTIONS[name].label;
            return (
              <button
                key={name}
                onClick={() => {
                  if (able || active) selectTool(name);
                }}
                style={{
                  background: active
                    ? "rgba(240,180,0,0.2)"
                    : able
                      ? "rgba(255,255,255,0.6)"
                      : "rgba(255,255,255,0.2)",
                  border: `1.5px solid ${active ? "#e8a000" : able ? "rgba(120,180,220,0.5)" : "rgba(120,180,220,0.2)"}`,
                  color: active ? "#8a5800" : able ? "#4a90b8" : "rgba(74,144,184,0.35)",
                  borderRadius: 10,
                  padding: "5px 12px",
                  cursor: able || active ? "pointer" : "default",
                  fontSize: 11,
                  fontWeight: 700,
                  transition: "all 0.15s",
                  boxShadow: active ? "0 0 12px rgba(240,180,0,0.3)" : "none",
                }}
              >
                {label} <span style={{ opacity: 0.7, fontSize: 10 }}>{cost}pts</span>
              </button>
            );
          })}
        </div>

        {/* Active tool hint */}
        {activeTool && (
          <div
            style={{
              fontSize: 10,
              color: "#e8a000",
              fontWeight: 600,
              letterSpacing: 0.5,
            }}
          >
            {activeTool === "swap" && !swapFirst && "Clique une première pile"}
            {activeTool === "swap" && swapFirst && "Clique la deuxième pile"}
            {activeTool === "bubble" && "Clique une pile à inverser"}
            {activeTool === "trim" && "Clique une pile pour rogner le haut"}
            {" · "}
            <span
              style={{ cursor: "pointer", textDecoration: "underline" }}
              onClick={() => {
                setActiveTool(null);
                setSwapFirst(null);
              }}
            >
              annuler
            </span>
          </div>
        )}

        {/* Undo + Reset + Back + Cheat */}
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <button
            onClick={undo}
            disabled={!canUndo}
            style={{
              background: canUndo ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.25)",
              border: "1px solid rgba(120,180,220,0.5)",
              color: canUndo ? "#4a90b8" : "rgba(74,144,184,0.4)",
              borderRadius: 10,
              padding: "5px 14px",
              cursor: canUndo ? "pointer" : "default",
              fontSize: 11,
              letterSpacing: 1,
              fontWeight: 700,
              transition: "all 0.15s",
            }}
          >
            ↩ {UNDO_COST}pts
          </button>
          <button
            onClick={reset}
            style={{
              background: "rgba(255,255,255,0.6)",
              border: "1px solid rgba(120,180,220,0.5)",
              color: "#4a90b8",
              borderRadius: 10,
              padding: "5px 14px",
              cursor: "pointer",
              fontSize: 11,
              letterSpacing: 2,
              fontWeight: 700,
              transition: "all 0.15s",
            }}
          >
            RESET
          </button>
          {cheatUnlocked && (
            <button
              onClick={() => {
                setPoints((p) => p + 100);
              }}
              style={{
                background: "rgba(255,220,50,0.25)",
                border: "1px solid rgba(200,160,0,0.5)",
                color: "#9a7000",
                borderRadius: 10,
                padding: "5px 14px",
                cursor: "pointer",
                fontSize: 11,
                letterSpacing: 1,
                fontWeight: 700,
                transition: "all 0.15s",
              }}
            >
              🐛 +100 pts
            </button>
          )}
        </div>
      </div>

      {/* Drag ghost */}
      {dragActive && (
        <svg
          width={R * 2 + 4}
          height={MAX_VIS * LAYER_H + R * 2 + SIDE_D + 4}
          overflow="visible"
          style={{
            position: "fixed",
            left: dragPos.x - R,
            top: dragPos.y - R - (MAX_VIS * LAYER_H) / 2,
            pointerEvents: "none",
            zIndex: 9999,
            opacity: 0.92,
            filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.2))",
          }}
        >
          {draggedStack && <Stack3D stack={draggedStack} cx={R + 2} cy={R + MAX_VIS * LAYER_H} />}
        </svg>
      )}
    </div>
  );
}
