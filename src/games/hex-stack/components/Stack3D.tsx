import type React from "react";
import type { Stack } from "../types";
import { LAYER_H, MAX_VIS, SIDE_D } from "../constants";
import { topOf } from "../board";
import Tile from "./Tile";

type Stack3DProps = {
  readonly stack: Stack;
  readonly cx: number;
  readonly cy: number;
  readonly ghost?: boolean;
};

/** Normal layer height up to MAX_VIS tiles; compresses beyond to cap total stack height. */
function stackLayerH(n: number): number {
  return n <= MAX_VIS ? LAYER_H : Math.max(2, Math.floor((MAX_VIS * LAYER_H) / n));
}

export default function Stack3D({
  stack,
  cx,
  cy,
  ghost = false,
}: Stack3DProps): React.ReactElement {
  const topC = topOf(stack);
  let topRun = 0;
  if (topC !== null) {
    for (let i = stack.length - 1; i >= 0 && stack[i] === topC; i--) topRun++;
  }
  const topIdx = stack.length - 1;
  const layerH = stackLayerH(stack.length);
  const depth = Math.max(1, Math.round((layerH * SIDE_D) / LAYER_H));

  return (
    <g filter={ghost ? "none" : "url(#stackShadow)"} opacity={ghost ? 0.55 : 1}>
      {stack.map((cid, i) => (
        <Tile
          key={i}
          cx={cx}
          cy={cy}
          dy={-(i * layerH)}
          colorId={cid}
          isTop={i === topIdx}
          topRun={i === topIdx ? topRun : 0}
          depth={depth}
        />
      ))}
    </g>
  );
}
