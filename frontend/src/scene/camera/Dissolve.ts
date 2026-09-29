// The band dissolves (DESIGN §10): each is a modeller's gesture done by the bands themselves (the lid comes down,
// the city's fixtures rise out of the plate); this adds the fog medium the outgoing band passes through, a veil
// in the stage's fog tint in front of the camera that peaks mid-window. No render target: §10's half-res RT blend is
// replaced by the veil (one draw, and the same on SwiftShader), written down here.
// Reduced motion: the veil is a 150 ms-feeling fade through --ground rather than fog.

import * as THREE from 'three';

/** DESIGN §10's windows: [1.35, 1.65] the lid, [2.35, 2.65] the baseboard, [3.35, 3.65] the plateau. */
export const WINDOWS = [[1.35, 1.65], [2.35, 2.65], [3.35, 3.65]] as const;
export const weight = (a: number, lo: number, hi: number): number => { const t = Math.min(1, Math.max(0, (a - lo) / (hi - lo))); return t * t * (3 - 2 * t); };

export class Dissolve {
  readonly veil: THREE.Mesh;
  private readonly mat: THREE.MeshBasicMaterial;

  constructor(camera: THREE.PerspectiveCamera, reduced: boolean) {
    this.mat = new THREE.MeshBasicMaterial({ color: reduced ? '#16110c' : '#6e6152', transparent: true, opacity: 0, depthTest: false, depthWrite: false });
    this.veil = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.veil.renderOrder = 999;
    this.veil.frustumCulled = false;
    this.veil.name = 'dissolve-veil';
    camera.add(this.veil);
  }

  /** Per render frame: the veil's opacity peaks (0.35) at the middle of whichever window A is in. */
  update(a: number, camera: THREE.PerspectiveCamera): void {
    let o = 0;
    for (const [lo, hi] of WINDOWS.slice(1)) { const w = weight(a, lo, hi); o = Math.max(o, 4 * w * (1 - w) * 0.35); }
    this.mat.opacity = o;
    this.veil.visible = o > 0.002;
    // Fill the view just past the near plane.
    const d = camera.near * 1.5;
    const h = 2 * d * Math.tan((camera.fov * Math.PI) / 360);
    this.veil.position.set(0, 0, -d);
    this.veil.scale.set((h * camera.aspect) / 2 + 0.01, h / 2 + 0.01, 1);
  }
}
