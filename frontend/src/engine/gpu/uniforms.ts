// The shared uniforms (ARCHITECTURE §6.4): one object, referenced by every tile material; the render loop writes
// numbers into it and never reads a Frame.

import * as THREE from 'three';
import { PULSE_RING } from '../store/clips.ts';

export interface SharedUniforms {
  uTime: { value: number }; uTickT: { value: number }; uTickSeconds: { value: number }; uAltitude: { value: number };
  uReducedMotion: { value: number }; uPxPerUnit: { value: number }; uDpr: { value: number }; uHatchWeight: { value: number }; uEdgeGain: { value: number };
  uFogTint: { value: THREE.Color }; uBurnRef: { value: number };
  uTruth: { value: THREE.DataTexture }; uTruthPrev: { value: THREE.DataTexture }; uTimes: { value: THREE.DataTexture };
  uPulses: { value: THREE.Vector4[] }; uPulseData: { value: THREE.Vector4[] };
  uKeyDir: { value: THREE.Vector3 }; uKeyColor: { value: THREE.Color }; uHemiSky: { value: THREE.Color }; uHemiGround: { value: THREE.Color };
}

export function createUniforms(truth: { truth: THREE.DataTexture; prev: THREE.DataTexture; times: THREE.DataTexture }): SharedUniforms {
  return {
    uTime: { value: 0 }, uTickT: { value: -1e9 }, uTickSeconds: { value: 1.2 }, uAltitude: { value: 1 },
    uReducedMotion: { value: 0 }, uPxPerUnit: { value: 10 }, uDpr: { value: 1 }, uHatchWeight: { value: 0.35 }, uEdgeGain: { value: 4 },
    uFogTint: { value: new THREE.Color('#5f5548') }, uBurnRef: { value: 1 },
    uTruth: { value: truth.truth }, uTruthPrev: { value: truth.prev }, uTimes: { value: truth.times },
    uPulses: { value: Array.from({ length: PULSE_RING }, () => new THREE.Vector4()) },
    uPulseData: { value: Array.from({ length: PULSE_RING }, () => new THREE.Vector4()) },
    uKeyDir: { value: new THREE.Vector3(0, 1, 0) }, uKeyColor: { value: new THREE.Color(1, 1, 1) },
    uHemiSky: { value: new THREE.Color(1, 1, 1) }, uHemiGround: { value: new THREE.Color(0.2, 0.2, 0.2) },
  };
}

/** Copy the pulse ring into the uniform vectors (only when it changed). */
export function uploadPulses(u: SharedUniforms, pulses: Float32Array, data: Float32Array): void {
  for (let i = 0; i < u.uPulses.value.length; i++) {
    u.uPulses.value[i].fromArray(pulses, i * 4);
    u.uPulseData.value[i].fromArray(data, i * 4);
  }
}
