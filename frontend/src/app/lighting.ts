// The five lighting presets (ARCHITECTURE §B.1) as data. Day and night are a lighting preset, never a palette
// swap; every key is warm so cyan stays the only cold colour.

import * as THREE from 'three';
import type { LightingPreset, LightingState } from '../engine/store/bus.ts';

export interface LightingRow { azimuth: number; elevation: number; key: string; keyIntensity: number; sky: string; ground: string; hemi: number; lantern: number }

export const LIGHTING: Record<LightingPreset, LightingRow> = {
  dawn: { azimuth: 100, elevation: 10, key: '#e6b78a', keyIntensity: 1.4, sky: '#2c2219', ground: '#16110c', hemi: 0.5, lantern: 0.9 },
  // DESIGN §2b amends Noon for the exterior: hemisphere sky #e9dfc6, ground #3a2f24, × 0.9.
  noon: { azimuth: 200, elevation: 62, key: '#f4e6c8', keyIntensity: 2.4, sky: '#e9dfc6', ground: '#3a2f24', hemi: 0.9, lantern: 0.25 },
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

/** The preset's sky/ground are dark sRGB tones; as light colours they are tints, so normalise to full brightness. */
const tint = (hex: string) => { const c = new THREE.Color(hex); const m = Math.max(c.r, c.g, c.b) || 1; return c.multiplyScalar(1 / m); };

/**
 * Golden lights the room. Its gains are measured on SwiftShader (tests/gpu/room-light.spec.ts): three's Lambert is
 * albedo/π, so REVIEW-ROOM's key 2.5 / hemisphere 1.75 left the floor at 6/255; Golden lands at key 4.5 and
 * hemisphere 4.0 with the tones read as tints. The exterior presets (DESIGN §2b) are used as written.
 */
const GAIN: Partial<Record<LightingPreset, { key: number; hemi: number; tint: boolean }>> = {
  golden: { key: 4.5 / 1.9, hemi: 4.0 / 0.6, tint: true },
};

/** DESIGN §2b: Golden for Stage 1 (and the thumbnail), Noon for Stages 2–5, unless the person chose a preset. */
export const presetForBand = (band: number, chosen: LightingPreset | null): LightingPreset => chosen ?? (band === 1 ? 'golden' : 'noon');

/** The preset's key and hemisphere, shared by every band (App owns them; bands add only their own lamps). */
export class WorldLights {
  readonly group = new THREE.Group();
  readonly key: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  preset: LightingPreset | null = null;

  constructor(lighting: LightingState, readonly shadows: boolean) {
    this.key = new THREE.DirectionalLight();
    this.hemi = new THREE.HemisphereLight();
    // Real cast shadows outdoors at Balanced and above (§2b); the frustum follows the camera's target.
    this.key.castShadow = shadows;
    this.key.shadow.mapSize.set(2048, 2048);
    const c = this.key.shadow.camera;
    c.left = -60; c.right = 60; c.top = 60; c.bottom = -60; c.near = 1; c.far = 400;
    this.key.shadow.bias = -0.0006;
    this.key.shadow.normalBias = 0.04;
    this.group.name = 'world-lights';
    this.group.add(this.key, this.key.target, this.hemi);
    this.setPreset(lighting.preset);
  }

  setPreset(preset: LightingPreset): void {
    if (preset === this.preset) return;
    this.preset = preset;
    const row = LIGHTING[preset];
    const g = GAIN[preset] ?? { key: 1, hemi: 1, tint: false };
    this.key.color.set(row.key);
    this.key.intensity = row.keyIntensity * g.key;
    this.hemi.color.copy(g.tint ? tint(row.sky) : new THREE.Color(row.sky));
    this.hemi.groundColor.copy(g.tint ? tint(row.ground) : new THREE.Color(row.ground));
    this.hemi.intensity = row.hemi * g.hemi;
  }

  /** Keep the key's direction, centred on what the camera looks at, so its shadow frustum covers the view. */
  follow(target: THREE.Vector3, span: number): void {
    const [x, y, z] = keyDirection(LIGHTING[this.preset ?? 'golden']);
    this.key.target.position.copy(target);
    this.key.position.set(target.x + x * 150, target.y + y * 150, target.z + z * 150);
    const c = this.key.shadow.camera;
    const h = Math.max(20, span * 0.75);
    if (c.right !== h) { c.left = -h; c.right = h; c.top = h; c.bottom = -h; c.updateProjectionMatrix(); }
  }
}
