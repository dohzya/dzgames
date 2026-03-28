import type React from "react";
import { COLORS } from "../constants";

export default function HexDefs(): React.ReactElement {
  return (
    <defs>
      <style>{`
        @keyframes clrPulse{0%,100%{opacity:1}45%{opacity:0.1}}
        @keyframes unlockPop{0%{transform:scale(0.6);opacity:0}65%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
        @keyframes popFloat{0%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-40px)}}
        @keyframes cantAfford{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
        @keyframes bannerPop{0%{opacity:0;transform:translateX(-50%) translateY(-12px)}100%{opacity:1;transform:translateX(-50%) translateY(0)}}
        @keyframes toolPulse{0%,100%{opacity:0.5}50%{opacity:1}}
        @keyframes newUnlockPulse{0%{opacity:0.4}50%{opacity:1}100%{opacity:0.4}}
      `}</style>

      {/* Drop shadow for whole stacks */}
      <filter id="stackShadow" x="-25%" y="-10%" width="150%" height="140%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="6" result="b" />
        <feOffset dx="0" dy="10" result="o" />
        <feFlood floodColor="#1020a0" floodOpacity="0.18" result="c" />
        <feComposite in="c" in2="o" operator="in" result="s" />
        <feMerge>
          <feMergeNode in="s" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      {/* Floor cell highlight */}
      <radialGradient id="floorHL" cx="25%" cy="20%" r="55%" gradientUnits="objectBoundingBox">
        <stop offset="0%" stopColor="white" stopOpacity="0.45" />
        <stop offset="60%" stopColor="white" stopOpacity="0.08" />
        <stop offset="100%" stopColor="white" stopOpacity="0" />
      </radialGradient>

      {/* Per-color gradients */}
      {COLORS.map((col) => (
        <g key={col.id}>
          <linearGradient
            id={`hxT${String(col.id)}`}
            x1="0.05"
            y1="0"
            x2="0.95"
            y2="1"
            gradientUnits="objectBoundingBox"
          >
            <stop offset="0%" stopColor={col.top} />
            <stop offset="100%" stopColor={col.topDark} />
          </linearGradient>
          <radialGradient
            id={`hxHL${String(col.id)}`}
            cx="22%"
            cy="18%"
            r="55%"
            gradientUnits="objectBoundingBox"
          >
            <stop offset="0%" stopColor="white" stopOpacity="0.22" />
            <stop offset="55%" stopColor="white" stopOpacity="0.04" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
        </g>
      ))}
    </defs>
  );
}
