import { HEX_YS, VROWS, VCOLS, PAD_H, PAD_V, HH, CW } from "./constants";

export function cellXY(col: number, row: number): readonly [number, number] {
  return [PAD_H + col * CW, PAD_V + row * HH + (col % 2 ? HH / 2 : 0)];
}

export function hexPts(
  cx: number,
  cy: number,
  r: number
): ReadonlyArray<readonly [number, number]> {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a) * HEX_YS] as const;
  });
}

export function rhp(cx: number, cy: number, r: number, cr = 9): string {
  const v = hexPts(cx, cy, r);
  const f = (n: number) => n.toFixed(1);
  let d = "";
  for (let i = 0; i < 6; i++) {
    const p = v[(i - 1 + 6) % 6];
    const c = v[i];
    const n = v[(i + 1) % 6];
    if (!p || !c || !n) continue;
    const d1 = Math.hypot(c[0] - p[0], c[1] - p[1]);
    const d2 = Math.hypot(n[0] - c[0], n[1] - c[1]);
    const ax = c[0] - ((c[0] - p[0]) / d1) * cr;
    const ay = c[1] - ((c[1] - p[1]) / d1) * cr;
    const bx = c[0] + ((n[0] - c[0]) / d2) * cr;
    const by = c[1] + ((n[1] - c[1]) / d2) * cr;
    d +=
      (i === 0 ? `M${f(ax)},${f(ay)}` : `L${f(ax)},${f(ay)}`) +
      ` Q${f(c[0])},${f(c[1])} ${f(bx)},${f(by)}`;
  }
  return d + "Z";
}

type QP = { ax: number; ay: number; bx: number; by: number; qx: number; qy: number };

export function sidePath(cx: number, cy: number, r: number, depth: number, cr = 9): string {
  const v = hexPts(cx, cy, r);
  const f = (n: number) => n.toFixed(1);

  function qp(i: number): QP {
    const p = v[(i - 1 + 6) % 6];
    const c = v[i];
    const n = v[(i + 1) % 6];
    if (!p || !c || !n) return { ax: 0, ay: 0, bx: 0, by: 0, qx: 0, qy: 0 };
    const d1 = Math.max(0.001, Math.hypot(c[0] - p[0], c[1] - p[1]));
    const d2 = Math.max(0.001, Math.hypot(n[0] - c[0], n[1] - c[1]));
    return {
      ax: c[0] - ((c[0] - p[0]) / d1) * cr,
      ay: c[1] - ((c[1] - p[1]) / d1) * cr,
      bx: c[0] + ((n[0] - c[0]) / d2) * cr,
      by: c[1] + ((n[1] - c[1]) / d2) * cr,
      qx: c[0],
      qy: c[1],
    };
  }

  const c0 = qp(0),
    c1 = qp(1),
    c2 = qp(2),
    c3 = qp(3);
  const D = depth;
  return (
    `M${f(c0.ax)},${f(c0.ay)} Q${f(c0.qx)},${f(c0.qy)} ${f(c0.bx)},${f(c0.by)}` +
    ` L${f(c1.ax)},${f(c1.ay)} Q${f(c1.qx)},${f(c1.qy)} ${f(c1.bx)},${f(c1.by)}` +
    ` L${f(c2.ax)},${f(c2.ay)} Q${f(c2.qx)},${f(c2.qy)} ${f(c2.bx)},${f(c2.by)}` +
    ` L${f(c3.ax)},${f(c3.ay)} Q${f(c3.qx)},${f(c3.qy)} ${f(c3.bx)},${f(c3.by)}` +
    ` L${f(c3.bx)},${f(c3.by + D)} Q${f(c3.qx)},${f(c3.qy + D)} ${f(c3.ax)},${f(c3.ay + D)}` +
    ` L${f(c2.bx)},${f(c2.by + D)} Q${f(c2.qx)},${f(c2.qy + D)} ${f(c2.ax)},${f(c2.ay + D)}` +
    ` L${f(c1.bx)},${f(c1.by + D)} Q${f(c1.qx)},${f(c1.qy + D)} ${f(c1.ax)},${f(c1.ay + D)}` +
    ` L${f(c0.bx)},${f(c0.by + D)} Q${f(c0.qx)},${f(c0.qy + D)} ${f(c0.ax)},${f(c0.ay + D)}Z`
  );
}

export function getNeighbors(row: number, col: number): ReadonlyArray<readonly [number, number]> {
  const dr = col % 2 === 1 ? 1 : -1;
  return (
    [
      [row - 1, col],
      [row + 1, col],
      [row, col - 1],
      [row + dr, col - 1],
      [row, col + 1],
      [row + dr, col + 1],
    ] as Array<readonly [number, number]>
  ).filter(([r, c]) => r >= 0 && r < VROWS && c >= 0 && c < VCOLS);
}
