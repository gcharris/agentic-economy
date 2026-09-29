// The band table of DESIGN §10 / ARCHITECTURE §8 as data (atlas lane, frozen with the day-0 seams).

import type { Band } from '../../engine/store/bus.ts';

export interface BandRow {
  band: Band;
  steady: [number, number];
  up: number | null;
  down: number | null;
  /** View height H in metres at the band centre; street and city are data-dependent (heightFor). */
  H: number;
  pitchDeg: number;
  fovDeg: number;
  tickSeconds: number;
}

export const BANDS: readonly BandRow[] = [
  { band: 1, steady: [1.0, 1.5], up: 1.6, down: null, H: 14, pitchDeg: 30, fovDeg: 4, tickSeconds: 1.2 },
  { band: 2, steady: [1.5, 2.5], up: 2.6, down: 1.4, H: 70, pitchDeg: 30, fovDeg: 4, tickSeconds: 0.7 },
  { band: 3, steady: [2.5, 3.5], up: 3.6, down: 2.4, H: 140, pitchDeg: 30, fovDeg: 4, tickSeconds: 0.4 },
  { band: 4, steady: [3.5, 4.5], up: 4.6, down: 3.4, H: 6000, pitchDeg: 30, fovDeg: 4, tickSeconds: 0.3 },
  { band: 5, steady: [4.5, 5.0], up: null, down: 4.4, H: 16000, pitchDeg: 55, fovDeg: 4, tickSeconds: 0.25 },
];

export const YAW_DEG = 45;

/** The dolly identity: the distance at which a vertical field of view `fovDeg` spans H metres. */
export const dolly = (H: number, fovDeg: number): number => H / (2 * Math.tan((fovDeg * Math.PI) / 360));

/** H(A), log-interpolated between band centres (band k's H at A = k). */
export function heightAt(a: number, H: readonly number[] = BANDS.map((b) => b.H)): number {
  const x = Math.min(5, Math.max(1, a));
  const k = Math.min(3, Math.floor(x) - 1);
  const f = x - (k + 1);
  return Math.exp(Math.log(H[k]) * (1 - f) + Math.log(H[k + 1]) * f);
}
