// The wallpaper haze (DESIGN §9): fog = 1 − Φ drawn as lantern smoke on the room's walls. A domain-warped
// noise sample, desaturation toward the stage tint at 0.7 · fog, grain at fog² · 0.35, and under it at 35 %
// the hatch (four grades, anchored to the wall so the lines never swim): a pattern channel that reads the same
// to a colour-vision-deficient viewer. The shader tweens two engine truths, Φ before and Φ after, and invents
// nothing. The chroma split below Φ 0.75 is left to the tile shader (it needs a second sample).

import * as THREE from 'three';

export interface HazeUniforms {
  material: THREE.MeshLambertMaterial;
  uniforms: {
    uPhiA: { value: number }; uPhiB: { value: number }; uT0: { value: number }; uTime: { value: number };
    uReduced: { value: number }; uTint: { value: THREE.Color }; uWall: { value: THREE.Color }; uWall2: { value: THREE.Color };
  };
  /** A new engine truth: tween from whatever is on screen now to `phi` over 600 ms. */
  setPhi(phi: number, now: number): void;
  /** Φ as drawn at time t (for tests). */
  phiAt(t: number): number;
}

const TWEEN = 0.6;

export function hazeMaterial(wall: string, wall2: string, tint = '#8a7a64'): HazeUniforms {
  const uniforms = {
    uPhiA: { value: 1 }, uPhiB: { value: 1 }, uT0: { value: -1e9 }, uTime: { value: 0 }, uReduced: { value: 0 },
    uTint: { value: new THREE.Color(tint) }, uWall: { value: new THREE.Color(wall) }, uWall2: { value: new THREE.Color(wall2) },
  };
  const material = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  material.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHazePos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvHazePos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vHazePos;
uniform float uPhiA, uPhiB, uT0, uTime, uReduced;
uniform vec3 uTint, uWall, uWall2;
float hz_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hz_noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hz_hash(i), hz_hash(i + vec2(1, 0)), f.x), mix(hz_hash(i + vec2(0, 1)), hz_hash(i + vec2(1, 1)), f.x), f.y);
}
float hz_fbm(vec2 p) { return 0.55 * hz_noise(p) + 0.3 * hz_noise(p * 2.1 + 7.3) + 0.15 * hz_noise(p * 4.3 - 2.9); }
float hz_line(float u, float spacing) { float d = abs(fract(u / spacing) - 0.5); return 1.0 - smoothstep(0.08, 0.16, d); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb = mix(uWall2, uWall, smoothstep(0.0, 3.2, vHazePos.y));`)
      .replace('#include <opaque_fragment>', `
{
  float k = clamp((uTime - uT0) / ${TWEEN.toFixed(2)}, 0.0, 1.0);
  float phi = mix(uPhiA, uPhiB, k);
  float fog = clamp(1.0 - phi, 0.0, 1.0);
  float u = vHazePos.x + vHazePos.z;
  float drift = uReduced > 0.5 ? 0.0 : uTime * 0.04;
  vec2 q = vec2(u * 0.8, vHazePos.y * 1.1 - drift);
  vec2 warp = vec2(hz_fbm(q * 0.7 + 3.1), hz_fbm(q * 0.7 - 1.7)) * (fog * 0.06) * 60.0;
  float smoke = smoothstep(0.35, 0.9, hz_fbm(q + warp)) * clamp(fog * 3.0, 0.0, 1.0);
  smoke *= smoothstep(0.2, 2.6, vHazePos.y) * 0.8 + 0.2;           // smoke gathers under the ceiling
  float lum = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
  outgoingLight = mix(outgoingLight, uTint * max(lum, 0.03) * 1.6, 0.7 * fog);   // desaturate toward the stage tint
  outgoingLight = mix(outgoingLight, uTint * 0.42, uReduced > 0.5 ? 0.0 : smoke * 0.75);
  float g1 = smoothstep(0.02, 0.12, fog), g2 = smoothstep(0.30, 0.40, fog), g3 = smoothstep(0.55, 0.65, fog), g4 = smoothstep(0.80, 0.90, fog);
  float hatch = max(max(g1 * hz_line(u + vHazePos.y, 0.14), g2 * hz_line(u - vHazePos.y, 0.14)), max(g3 * hz_line(vHazePos.y, 0.14), g4 * hz_line(u, 0.14)));
  outgoingLight *= 1.0 - hatch * (uReduced > 0.5 ? 0.85 : 0.35) * 0.5;
  float grain = (hz_hash(gl_FragCoord.xy + (uReduced > 0.5 ? 0.0 : floor(uTime * 24.0))) - 0.5) * fog * fog * 0.35;
  outgoingLight += grain * 0.25;
}
#include <opaque_fragment>`);
  };
  const phiAt = (t: number) => {
    const k = Math.min(1, Math.max(0, (t - uniforms.uT0.value) / TWEEN));
    return uniforms.uPhiA.value + (uniforms.uPhiB.value - uniforms.uPhiA.value) * k;
  };
  return {
    material, uniforms, phiAt,
    setPhi(phi, now) {
      if (phi === uniforms.uPhiB.value) return;
      uniforms.uPhiA.value = phiAt(now);
      uniforms.uPhiB.value = phi;
      uniforms.uT0.value = now;
    },
  };
}
