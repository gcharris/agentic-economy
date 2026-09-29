// The five lighting presets (ARCHITECTURE §B.1) as data. Day and night are a lighting preset, never a palette
// swap; every key is warm so cyan stays the only cold colour.

import type { LightingPreset } from '../engine/store/bus.ts';

export interface LightingRow { azimuth: number; elevation: number; key: string; keyIntensity: number; sky: string; ground: string; hemi: number; lantern: number }

export const LIGHTING: Record<LightingPreset, LightingRow> = {
  dawn: { azimuth: 100, elevation: 10, key: '#e6b78a', keyIntensity: 1.4, sky: '#2c2219', ground: '#16110c', hemi: 0.5, lantern: 0.9 },
  noon: { azimuth: 200, elevation: 62, key: '#f4e6c8', keyIntensity: 2.4, sky: '#3a2f24', ground: '#19130d', hemi: 0.8, lantern: 0.25 },
  golden: { azimuth: 235, elevation: 26, key: '#e8c48a', keyIntensity: 1.9, sky: '#2c2219', ground: '#16110c', hemi: 0.6, lantern: 0.8 },
  dusk: { azimuth: 265, elevation: 8, key: '#d49a6a', keyIntensity: 1.0, sky: '#241c14', ground: '#120e0a', hemi: 0.45, lantern: 1.3 },
  night: { azimuth: 300, elevation: 18, key: '#8a7a64', keyIntensity: 0.3, sky: '#1e1710', ground: '#0a0806', hemi: 0.3, lantern: 1.6 },
};
export const LIGHTING_PRESETS = Object.keys(LIGHTING) as LightingPreset[];

/** Unit vector toward the key light: azimuth clockwise from north (−z), elevation above the horizon. */
export function keyDirection(row: LightingRow): [number, number, number] {
  const a = (row.azimuth * Math.PI) / 180, e = (row.elevation * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
}
