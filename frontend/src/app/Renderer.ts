// The renderer seam (ARCHITECTURE §9.1, day 0). App drives a Renderer; tests pass a NullRenderer,
// which owns a real THREE.Scene and camera (bands can mount into them) but never touches WebGL.

import * as THREE from 'three';

export interface Renderer {
  readonly kind: 'null' | 'webgl';
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  /** null under NullRenderer. */
  readonly gl: THREE.WebGLRenderer | null;
  /** Render frames drawn so far (reducer.test.ts compares this with the reduce count). */
  readonly frames: number;
  /** CSS pixel rows of the viewport (the rig holds pixels per metre against it). */
  readonly rows: number;
  setSize(w: number, h: number, dpr: number): void;
  render(): void;
  dispose(): void;
}

export class NullRenderer implements Renderer {
  readonly kind = 'null' as const;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(4, 16 / 9, 1, 1000);
  readonly gl = null;
  frames = 0;
  size = { w: 1280, h: 720, dpr: 1 };
  get rows(): number { return this.size.h; }

  setSize(w: number, h: number, dpr: number): void {
    this.size = { w, h, dpr };
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }
  render(): void { this.frames++; }
  dispose(): void { /* nothing to free */ }
}
