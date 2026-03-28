import type React from "react";
import type { ColorId } from "../types";
import { R, SIDE_D, COLORS } from "../constants";
import { rhp } from "../geometry";

type TileProps = {
  readonly cx: number;
  readonly cy: number;
  readonly dy?: number;
  readonly colorId: ColorId;
  readonly isTop: boolean;
  readonly topRun?: number;
  readonly r?: number;
  readonly depth?: number;
  readonly opacity?: number;
};

export default function Tile({
  cx,
  cy,
  dy = 0,
  colorId,
  isTop,
  topRun = 0,
  r = R - 2,
  depth = SIDE_D,
  opacity = 1,
}: TileProps): React.ReactElement {
  const col = COLORS[colorId];
  const rimDark = col?.rimDark ?? "#000";
  const oy = cy + dy;
  return (
    <g opacity={opacity}>
      {/* Dark underside hex — offset down by depth, peeks below tile above = separator */}
      <path d={rhp(cx, oy + depth, r)} fill={rimDark} />
      {/* Face — gradient */}
      <path d={rhp(cx, oy, r)} fill={`url(#hxT${String(colorId)})`} />
      {/* Radial highlight */}
      <path d={rhp(cx, oy, r)} fill={`url(#hxHL${String(colorId)})`} />
      {isTop && topRun > 0 && (
        <text
          x={cx}
          y={oy}
          textAnchor="middle"
          dominantBaseline="central"
          fill="white"
          fontSize={20}
          fontWeight={900}
          fontFamily="Arial Rounded MT Bold, Nunito, system-ui, sans-serif"
          style={{
            pointerEvents: "none",
            userSelect: "none",
            filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))",
          }}
        >
          {topRun}
        </text>
      )}
    </g>
  );
}
