// The peg-cat (DESIGN §5): one low-poly figure for all five seats. Capsule body, sphere head, two tetrahedral
// ears, a curved tail strip, a base disc; flat-shaded vertex colours; poses are five morph targets, not a rig
// (idle, walkA, walkB, work, wait); an inverted-hull outline pushed along smoothed normals; a contact shadow.
// Exported for the street lane's couriers.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const MORPH = { idle: 0, walkA: 1, walkB: 2, work: 3, wait: 4 } as const;
export type Pose = keyof typeof MORPH;

const OAK_DARK = new THREE.Color('#3e2d1f');
const HEAD_Y = 0.70;

type Part = 'base' | 'body' | 'head' | 'ear' | 'tail';

function part(g: THREE.BufferGeometry, p: Part, color: THREE.Color): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  geo.deleteAttribute('uv');
  const n = geo.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  const shade = p === 'base' ? 1 : p === 'head' || p === 'ear' ? 1.06 : 1;
  const col = p === 'base' ? OAK_DARK : color;
  for (let i = 0; i < n; i++) {
    const y = geo.getAttribute('position').getY(i);
    const k = p === 'body' && y < 0.2 ? 0.92 : shade; // feet darker, head lighter
    c.set([col.r * k, col.g * k, col.b * k], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  geo.setAttribute('part', new THREE.BufferAttribute(new Float32Array(n).fill(['base', 'body', 'head', 'ear', 'tail'].indexOf(p)), 1));
  return geo;
}

function tailStrip(): THREE.BufferGeometry {
  // A curved 0.40 m ribbon from the rump, rising behind the cat (−z is its back).
  const pts: number[] = [];
  const seg = 5;
  for (let i = 0; i < seg; i++) {
    for (const [a, b] of [[i / seg, (i + 1) / seg]]) {
      const p = (t: number, s: number) => [s * 0.03, 0.18 + Math.sin(t * Math.PI * 0.6) * 0.28, -0.14 - t * 0.2];
      const [a0, a1, b0, b1] = [p(a, -1), p(a, 1), p(b, -1), p(b, 1)];
      pts.push(...a0, ...a1, ...b1, ...a0, ...b1, ...b0, ...a1, ...a0, ...b0, ...a1, ...b0, ...b1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.computeVertexNormals();
  return g;
}

/** Pose deltas applied per part to the base positions to build the morph targets. */
function poseMatrix(pose: Pose, p: Part): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  const about = (pivot: THREE.Vector3, rx: number, rz = 0) =>
    new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z)
      .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, 0, rz)))
      .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
  const neck = new THREE.Vector3(0, 0.52, 0.02);
  const rump = new THREE.Vector3(0, 0.18, -0.14);
  const hips = new THREE.Vector3(0, 0.05, 0);
  switch (pose) {
    case 'idle': return m;
    case 'walkA':
    case 'walkB': {
      const s = pose === 'walkA' ? 1 : -1;
      if (p === 'body' || p === 'head' || p === 'ear') return about(hips, 0, 0.06 * s).premultiply(new THREE.Matrix4().makeTranslation(0, 0.03, 0));
      if (p === 'tail') return about(rump, -0.35).premultiply(new THREE.Matrix4().makeTranslation(0, 0.03, 0));
      return m;
    }
    case 'work':
      if (p === 'body') return about(hips, 0.18);
      if (p === 'head' || p === 'ear') return about(hips, 0.18).multiply(about(neck, 0.25));
      if (p === 'tail') return about(rump, 0.1);
      return m;
    case 'wait': // tail still and down, head 6° down, no bob
      if (p === 'head' || p === 'ear') return about(neck, (6 * Math.PI) / 180);
      if (p === 'tail') return about(rump, 0.55);
      return m;
  }
}

const cache = new Map<string, THREE.BufferGeometry>();

/** The merged cat geometry in one fur colour, with five morph targets and a smoothed-normal attribute. */
export function pegCatGeometry(fur: string): THREE.BufferGeometry {
  const hit = cache.get(fur);
  if (hit) return hit;
  const color = new THREE.Color(fur);
  const body = new THREE.CapsuleGeometry(0.15, 0.2, 3, 6).scale(1, 1, 0.75 / 0.75).translate(0, 0.33, 0);
  const head = new THREE.IcosahedronGeometry(0.14, 0).translate(0, HEAD_Y, 0.03);
  const earL = new THREE.TetrahedronGeometry(0.06).rotateZ(0.3).translate(-0.07, HEAD_Y + 0.12, 0.02);
  const earR = new THREE.TetrahedronGeometry(0.06).rotateZ(-0.3).translate(0.07, HEAD_Y + 0.12, 0.02);
  const base = new THREE.CylinderGeometry(0.12, 0.12, 0.03, 10).translate(0, 0.015, 0);
  const parts: [THREE.BufferGeometry, Part][] = [[base, 'base'], [body, 'body'], [head, 'head'], [earL, 'ear'], [earR, 'ear'], [tailStrip(), 'tail']];
  const merged = mergeGeometries(parts.map(([g, p]) => part(g, p, color)))!;

  const pos = merged.getAttribute('position') as THREE.BufferAttribute;
  const partAttr = merged.getAttribute('part') as THREE.BufferAttribute;
  const names = ['base', 'body', 'head', 'ear', 'tail'] as const;
  merged.morphAttributes.position = (Object.keys(MORPH) as Pose[]).map((pose) => {
    const out = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(poseMatrix(pose, names[partAttr.getX(i)]));
      out.set([v.x - pos.getX(i), v.y - pos.getY(i), v.z - pos.getZ(i)], i * 3); // relative deltas
    }
    return new THREE.BufferAttribute(out, 3);
  });
  merged.morphTargetsRelative = true;
  merged.computeVertexNormals();
  merged.setAttribute('smoothNormal', smoothNormals(merged));
  cache.set(fur, merged);
  return merged;
}

/** Averaged normals per position, so the hull does not crack at the facets. */
function smoothNormals(g: THREE.BufferGeometry): THREE.BufferAttribute {
  const pos = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  const acc = new Map<string, THREE.Vector3>();
  const key = (i: number) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    const a = acc.get(k) ?? new THREE.Vector3();
    a.x += nrm.getX(i); a.y += nrm.getY(i); a.z += nrm.getZ(i);
    acc.set(k, a);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) out.set(acc.get(key(i))!.clone().normalize().toArray(), i * 3);
  return new THREE.BufferAttribute(out, 3);
}

const outlineMaterial = (() => {
  const m = new THREE.MeshBasicMaterial({ color: '#0e0a06', side: THREE.BackSide });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 smoothNormal;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        // ~1 px at 1080 rows whatever the distance: push along the smoothed normal by a depth-scaled step.
        vec4 mvN = modelViewMatrix * vec4(smoothNormal, 0.0);
        mvPosition.xyz += normalize(mvN.xyz) * (-mvPosition.z) * 0.0011;
        gl_Position = projectionMatrix * mvPosition;`);
  };
  return m;
})();

export class PegCat extends THREE.Group {
  readonly body: THREE.Mesh;
  readonly outline: THREE.Mesh;
  readonly base: THREE.Mesh;
  private readonly weights: number[];

  constructor(fur: string) {
    super();
    const geo = pegCatGeometry(fur);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.body = new THREE.Mesh(geo, mat);
    this.body.castShadow = true;
    this.outline = new THREE.Mesh(geo, outlineMaterial);
    this.weights = [1, 0, 0, 0, 0];
    this.body.morphTargetInfluences = this.weights;
    this.outline.morphTargetInfluences = this.weights;
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 16).scale(0.16, 0.06, 1).rotateX(-Math.PI / 2).translate(0, 0.003, 0),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
    );
    // The burn glow lives on the base disc (DESIGN §5): an emissive disc, radius 0.35 m, at zero when cold.
    this.base = new THREE.Mesh(
      new THREE.CircleGeometry(0.35, 20).rotateX(-Math.PI / 2).translate(0, 0.004, 0),
      new THREE.MeshBasicMaterial({ color: '#c95140', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.add(shadow, this.base, this.outline, this.body);
  }

  /** Set the pose weights; walk phase f in [0,1) blends walkA/walkB. */
  pose(p: Pose, walkPhase = 0): void {
    this.weights.fill(0);
    if (p === 'walkA' || p === 'walkB') {
      const a = 0.5 + 0.5 * Math.sin(2 * Math.PI * walkPhase);
      this.weights[MORPH.walkA] = a;
      this.weights[MORPH.walkB] = 1 - a;
    } else {
      this.weights[MORPH[p]] = 1;
    }
  }

  /** 0 cold … 1 frontier_deep. */
  burn(glow: number): void { (this.base.material as THREE.MeshBasicMaterial).opacity = Math.max(0, Math.min(1, glow)) * 0.8; }
}
