import type React from "react";
import type { Stack } from "../types";
import { LAYER_H } from "../constants";
import { topOf } from "../board";
import Tile from "./Tile";

type Stack3DProps = {
  readonly stack: Stack;
  readonly cx: number;
  readonly cy: number;
  readonly ghost?: boolean;
};

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

  return (
    <g filter={ghost ? "none" : "url(#stackShadow)"} opacity={ghost ? 0.55 : 1}>
      {stack.map((cid, i) => (
        <Tile
          key={i}
          cx={cx}
          cy={cy}
          dy={-(i * LAYER_H)}
          colorId={cid}
          isTop={i === topIdx}
          topRun={i === topIdx ? topRun : 0}
        />
      ))}
    </g>
  );
}
