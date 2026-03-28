export type ColorId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Stack = ReadonlyArray<ColorId>;
export type Board = ReadonlyArray<ReadonlyArray<Stack>>;
export type CellKey = `${number},${number}`;

export type CellState =
  | { readonly state: "unlocked"; readonly cost: 0; readonly wave: number }
  | {
      readonly state: "locked";
      readonly cost: number;
      readonly wave: number;
      readonly revealOrder: number;
      readonly autoUnlock?: number;
      readonly preStack?: Stack;
      readonly everReady?: true;
    };

export type CellMap = ReadonlyMap<CellKey, CellState>;

export type Progression = { readonly nc: number; readonly maxColors: number };

export type Step =
  | {
      readonly type: "transfer";
      readonly from: readonly [number, number];
      readonly to: readonly [number, number];
      readonly color: ColorId;
      readonly before: Board;
      readonly after: Board;
    }
  | {
      readonly type: "clear";
      readonly at: readonly [number, number];
      readonly color: ColorId;
      readonly count: number;
      readonly clearPtsBase: number;
      readonly popX: number;
      readonly popY: number;
      readonly before: Board;
      readonly after: Board;
    };

export type StepResult = {
  readonly steps: ReadonlyArray<Step>;
  readonly finalBoard: Board;
  readonly totalCleared: number;
  readonly transferCount: number;
  readonly emptiedCount: number;
};

export type Snapshot = {
  readonly board: Board;
  readonly incoming: ReadonlyArray<Stack>;
  readonly cellMap: CellMap;
  readonly points: number;
  readonly cleared: number;
  readonly moveCount: number;
  readonly combo: number;
};

export type Popup = {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly text?: string;
  readonly pts?: number;
  readonly label?: string;
  readonly type?: "mult" | "transfer";
  readonly combo?: number;
  readonly small?: boolean;
};

export type ToolType = "swap" | "bubble" | "trim";

export type ActionUsages = {
  readonly swap: number;
  readonly bubble: number;
  readonly trim: number;
};
