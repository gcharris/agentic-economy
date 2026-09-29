// The WebGL renderer: one canvas, a DPR cap by quality, the scene the bands mount into, ?stats=1 overlay.

import * as THREE from 'three';
import type { QualityPreset } from '../engine/store/bus.ts';
import type { Renderer } from './Renderer.ts';

const DPR_CAP: Record<QualityPreset, number> = { low: 1, balanced: 1.5, high: 2 };

export class ThreeRenderer implements Renderer {
  readonly kind = 'webgl' as const;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(4, 16 / 9, 1, 1000);
  readonly gl: THREE.WebGLRenderer;
  frames = 0;
  private readonly onResize = () => this.setSize(innerWidth, innerHeight, devicePixelRatio);

  constructor(canvas: HTMLCanvasElement, readonly quality: QualityPreset, private readonly stats = false) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.35;
    this.gl.shadowMap.enabled = quality !== 'low';
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.scene.background = new THREE.Color('#16110c');
    addEventListener('resize', this.onResize);
    this.onResize();
  }

  setSize(w: number, h: number, dpr: number): void {
    this.gl.setPixelRatio(Math.min(dpr, DPR_CAP[this.quality]));
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.gl.render(this.scene, this.camera);
    this.frames++;
    if (this.stats && this.frames % 30 === 0) {
      const i = this.gl.info.render;
      document.title = `calls ${i.calls} · tris ${i.triangles}`;
    }
  }

  dispose(): void {
    removeEventListener('resize', this.onResize);
    this.gl.dispose();
  }
}
