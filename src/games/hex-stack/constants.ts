export const R = 42;
export const CW = R * 1.5;
export const HEX_YS = 0.62;
export const HH = Math.sqrt(3) * R * HEX_YS;
export const LAYER_H = 6;
export const MAX_VIS = 6;
export const SIDE_D = 4;
export const PAD_H = R + 20;
export const PAD_V = MAX_VIS * LAYER_H + R + 30;
export const VIEWPORT_W = 500;
export const VIEWPORT_H = 360;
export const CLEAR_AT = 10;
export const UNDO_COST = 5;
export const VROWS = 31;
export const VCOLS = 31;
export const OC = 15;
export const OR = 15;

// Computed from cellXY(OC, OR):
// cellXY(col, row) = [PAD_H + col*CW, PAD_V + row*HH + (col%2 ? HH/2 : 0)]
// OC=15 (odd), OR=15
// OX = PAD_H + OC*CW = (R+20) + 15*(R*1.5) = 42+20 + 15*63 = 62 + 945 = 1007
// OY = PAD_V + OR*HH + HH/2 = (MAX_VIS*LAYER_H+R+30) + 15*HH + HH/2
const _OX = PAD_H + OC * CW;
const _OY = PAD_V + OR * HH + (OC % 2 ? HH / 2 : 0);
export const INIT_PAN = { x: VIEWPORT_W / 2 - _OX, y: VIEWPORT_H / 2 - _OY } as const;

export type ColorDef = {
  readonly id: number;
  readonly top: string;
  readonly topDark: string;
  readonly side: string;
  readonly rimDark: string;
  readonly glow: string;
  readonly label: string;
};

export const COLORS: ReadonlyArray<ColorDef> = [
  {
    id: 0,
    top: "#EF7090",
    topDark: "#E04878",
    side: "#C03058",
    rimDark: "#991C4E",
    glow: "#ff4499",
    label: "Magenta",
  },
  {
    id: 1,
    top: "#7EEAB4",
    topDark: "#38B870",
    side: "#209858",
    rimDark: "#105830",
    glow: "#1abc9c",
    label: "Menthe",
  },
  {
    id: 2,
    top: "#90C8FF",
    topDark: "#5088E0",
    side: "#3068B8",
    rimDark: "#1A4090",
    glow: "#3498db",
    label: "Bleu",
  },
  {
    id: 3,
    top: "#FFE899",
    topDark: "#E8B830",
    side: "#C09000",
    rimDark: "#8A6800",
    glow: "#f39c12",
    label: "Jaune",
  },
  {
    id: 4,
    top: "#D8A8FF",
    topDark: "#A060E0",
    side: "#7030B8",
    rimDark: "#4A1880",
    glow: "#9b59b6",
    label: "Violet",
  },
  {
    id: 5,
    top: "#80F0F0",
    topDark: "#20C0C8",
    side: "#089098",
    rimDark: "#055860",
    glow: "#00bcd4",
    label: "Turquoise",
  },
  {
    id: 6,
    top: "#F5F5F8",
    topDark: "#C8C8D4",
    side: "#9090A8",
    rimDark: "#606070",
    glow: "#ecf0f1",
    label: "Blanc",
  },
  {
    id: 7,
    top: "#686878",
    topDark: "#404050",
    side: "#282830",
    rimDark: "#101018",
    glow: "#2c2c3c",
    label: "Noir",
  },
];

// Colors 0–3 are base colors (equal weight).
// Each subsequent color is 70% as likely as the previous rare color.
export const COLOR_WEIGHTS: ReadonlyArray<number> = [1, 1, 1, 1, 0.7, 0.49, 0.34, 0.24];

export const INC_CY = MAX_VIS * LAYER_H + R + 2;
export const INC_H = Math.ceil(INC_CY + R + SIDE_D + 4);
export const INC_GAP = CW * 2;
export const INC_START = (VIEWPORT_W - INC_GAP * 2) / 2;
export const INC_CX: ReadonlyArray<number> = [
  INC_START,
  INC_START + INC_GAP,
  INC_START + INC_GAP * 2,
];
