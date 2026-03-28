import type { Progression } from "./types";

export function getProgression(moves: number): Progression {
  if (moves < 10) return { nc: 4, maxColors: 2 };
  if (moves < 20) return { nc: 5, maxColors: 2 };
  if (moves < 35) return { nc: 5, maxColors: 3 };
  if (moves < 50) return { nc: 6, maxColors: 3 };
  if (moves < 70) return { nc: 7, maxColors: 3 };
  return { nc: 8, maxColors: 3 };
}
