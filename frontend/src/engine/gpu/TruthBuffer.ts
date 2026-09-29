// The truth buffer (ARCHITECTURE §6.1): three 256 × 256 DataTextures. uTruth / uTruthPrev are RGBA16F (phi, purse,
// heat, status + 8·held) written whole once per tick; uTimes is RGBA32F (syncT, packT, haltT, variance) written on
// events only. It is the store's TruthSink: reduce() uploads, the shaders read with texelFetch.

import * as THREE from 'three';
import type { TruthSink } from '../store/Store.ts';
import { TRUTH_LENGTH, TRUTH_SIZE } from '../store/slots.ts';

export class TruthBuffer implements TruthSink {
  readonly truth: THREE.DataTexture;
  readonly prev: THREE.DataTexture;
  readonly times: THREE.DataTexture;
  uploads = 0;

  constructor() {
    const half = () => {
      const t = new THREE.DataTexture(new Uint16Array(TRUTH_LENGTH), TRUTH_SIZE, TRUTH_SIZE, THREE.RGBAFormat, THREE.HalfFloatType);
      t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
      return t;
    };
    this.truth = half();
    this.prev = half();
    this.times = new THREE.DataTexture(new Float32Array(TRUTH_LENGTH), TRUTH_SIZE, TRUTH_SIZE, THREE.RGBAFormat, THREE.FloatType);
    this.times.magFilter = this.times.minFilter = THREE.NearestFilter; this.times.generateMipmaps = false; this.times.needsUpdate = true;
  }

  upload(truth: Uint16Array, prev: Uint16Array): void {
    this.truth.image.data = truth;
    this.prev.image.data = prev;
    this.truth.needsUpdate = true;
    this.prev.needsUpdate = true;
    this.uploads++;
  }

  uploadTimes(times: Float32Array, _touched: ReadonlySet<number>): void {
    this.times.image.data = times;
    this.times.needsUpdate = true;
  }

  dispose(): void { this.truth.dispose(); this.prev.dispose(); this.times.dispose(); }
}
