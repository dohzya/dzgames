import type React from "react";
import type { ColorId, Stack } from "../types";
import { R, SIDE_D, COLORS } from "../constants";
import { rhp, sidePath } from "../geometry";
import Stack3D from "./Stack3D";

type FloorHexProps = {
  readonly cx: number;
  readonly cy: number;
  readonly locked: boolean;
  readonly cost: number;
  readonly autoUnlock?: number;
  readonly preStack?: Stack;
  readonly canAfford: boolean;
  readonly isReady: boolean;
  readonly isHL: boolean;
  readonly isDonor: boolean;
  readonly isGlow: boolean;
  readonly dragActive: boolean;
  readonly selTop: ColorId | null;
  readonly isToolTarget: boolean;
  readonly isSwapFirst: boolean;
};

export default function FloorHex({
  cx,
  cy,
  locked,
  cost,
  autoUnlock,
  preStack,
  canAfford,
  isReady,
  isHL,
  isDonor,
  isGlow,
  dragActive,
  selTop,
  isToolTarget,
  isSwapFirst,
}: FloorHexProps): React.ReactElement {
  const r = R - 2;

  if (locked) {
    const isAuto = autoUnlock != null;
    const sideCol = isReady ? "rgba(180,205,228,0.5)" : "rgba(160,190,215,0.22)";
    const topCol = preStack
      ? isReady
        ? "rgba(200,225,245,0.62)"
        : "rgba(185,210,235,0.28)"
      : isReady
        ? "rgba(210,230,248,0.72)"
        : "rgba(195,220,240,0.28)";
    const strokeCol = isReady ? "rgba(155,195,225,0.7)" : "rgba(140,175,205,0.18)";

    return (
      <g
        style={{
          cursor: isReady && !isAuto ? (canAfford ? "pointer" : "not-allowed") : "default",
          opacity: isReady ? 1 : 0.45,
        }}
      >
        {preStack && preStack.length > 0 && isReady && (
          <Stack3D stack={preStack} cx={cx} cy={cy} ghost={true} />
        )}
        <path d={sidePath(cx, cy, r, SIDE_D)} fill={sideCol} />
        <path d={rhp(cx, cy, r)} fill={topCol} stroke={strokeCol} strokeWidth={0.8} />
        {!isAuto && (
          <>
            <text
              x={cx}
              y={preStack ? cy - 6 : cy - 5}
              textAnchor="middle"
              dominantBaseline="central"
              fill={isReady ? "#4a80a8" : "#6080a0"}
              fontSize={14}
              style={{ pointerEvents: "none" }}
            >
              🔒
            </text>
            <text
              x={cx}
              y={preStack ? cy + 9 : cy + 10}
              textAnchor="middle"
              dominantBaseline="central"
              fill={isReady ? "#5a8ab0" : "#7890a8"}
              fontSize={10}
              fontWeight={800}
              fontFamily="system-ui,sans-serif"
              style={{ pointerEvents: "none" }}
            >
              {cost.toLocaleString()}
            </text>
          </>
        )}
        {isAuto && (
          <text
            x={cx}
            y={cy + (preStack ? 9 : 0)}
            textAnchor="middle"
            dominantBaseline="central"
            fill={isReady ? "rgba(70,120,168,0.75)" : "rgba(90,120,155,0.45)"}
            fontSize={preStack ? 9 : 10}
            fontWeight={700}
            fontFamily="system-ui,sans-serif"
            style={{ pointerEvents: "none" }}
          >
            {autoUnlock.toLocaleString()}
          </text>
        )}
      </g>
    );
  }

  const topFill = isHL ? "#ffffff" : isDonor ? "#e4f2ff" : dragActive ? "#edf5ff" : "#ddeef8";
  const sideFill = isHL ? "#a4c8e8" : isDonor ? "#9cc4e4" : "#b8d4ea";
  const glowColor =
    selTop !== null ? (COLORS[selTop]?.glow ?? "rgba(155,195,225,0.7)") : "rgba(155,195,225,0.7)";
  const topStroke = isHL
    ? "#3aaeee"
    : isDonor && selTop !== null
      ? glowColor
      : "rgba(155,195,225,0.7)";
  const sw = isHL ? 2 : isDonor ? 1.5 : 0.7;

  return (
    <g>
      <path d={sidePath(cx, cy, r, SIDE_D)} fill={sideFill} />
      <path
        d={rhp(cx, cy, r)}
        fill={topFill}
        stroke={topStroke}
        strokeWidth={sw}
        style={isGlow ? { animation: "clrPulse 0.5s ease-in-out" } : undefined}
      />
      {/* Subtle highlight on floor cells */}
      <path d={rhp(cx, cy, r)} fill="url(#floorHL)" />
      {isHL && (
        <path d={rhp(cx, cy, r + 5)} fill="none" stroke="#3aaeee" strokeWidth={2} opacity={0.5} />
      )}
      {isDonor && !isHL && selTop !== null && (
        <path
          d={rhp(cx, cy, r + 5)}
          fill="none"
          stroke={glowColor}
          strokeWidth={1.5}
          opacity={0.35}
        />
      )}
      {isSwapFirst && (
        <path d={rhp(cx, cy, r + 6)} fill="none" stroke="#f1c40f" strokeWidth={2.5} opacity={0.9} />
      )}
      {isToolTarget && !isSwapFirst && !isHL && (
        <path
          d={rhp(cx, cy, r + 4)}
          fill="rgba(255,200,50,0.08)"
          stroke="#e8a000"
          strokeWidth={1.5}
          opacity={0.6}
          style={{ animation: "toolPulse 1s ease-in-out infinite" }}
        />
      )}
      {dragActive && !isHL && (
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fill="rgba(80,140,195,0.2)"
          fontSize={26}
          style={{ pointerEvents: "none" }}
        >
          +
        </text>
      )}
    </g>
  );
}
