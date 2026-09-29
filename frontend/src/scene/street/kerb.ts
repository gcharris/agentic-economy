// Shared street helpers: the rim dyes and the soft contact shadow. (The kerb itself is the commons' ring: commons.ts.)

import * as THREE from 'three';

export { dyeFor, STREET_DYES } from '../../engine/layout/dyes.ts';

/** A soft contact shadow (DESIGN §2b.4): a radial falloff texture shared by every plinth and figure. */
let softTex: THREE.DataTexture | null = null;
export function softShadowTexture(): THREE.DataTexture {
  if (softTex) return softTex;
  const n = 64, d = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const r = Math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5) / (n / 2);
    const a = Math.max(0, Math.min(1, (1 - r) / 0.35));
    d.set([0, 0, 0, Math.round(255 * a * a)], (y * n + x) * 4);
  }
  softTex = new THREE.DataTexture(d, n, n);
  softTex.needsUpdate = true;
  return softTex;
}
export function contactShadow(radius: number, opacity = 0.45): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: softShadowTexture(), transparent: true, opacity, depthWrite: false }));
  m.position.y = 0.004;
  m.renderOrder = -1;
  return m;
}
