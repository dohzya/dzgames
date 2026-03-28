import { CLEAR_AT } from "./constants";

export function baseCostForWave(wave: number): number {
  return Math.round(100 * Math.pow(1.45, wave - 1));
}

export function clearPts(n: number): number {
  return 10 + Math.pow(n - CLEAR_AT, 2);
}

export function comboMult(combo: number): number {
  return combo;
}

export function transferBonus(n: number): number {
  if (n < 3) return 0;
  let a = 1,
    b = 1;
  for (let i = 2; i < n - 1; i++) {
    const t = a + b;
    a = b;
    b = t;
  }
  return b;
}

export function emptyMult(emptied: number): number {
  return emptied + 1;
}

export function actionCost(base: number, usages: number): number {
  return base + 50 * usages;
}
