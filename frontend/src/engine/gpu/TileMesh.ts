// The plate mesh (ARCHITECTURE §7.3, the successor of §6.1's tile mesh): one InstancedMesh of plates for the whole
// graph (city, streets, houses) plus the satellite plates, and a second, tiny instanced ring of detached specks that
// only appears off a foggy rim. Per instance: aCenter, aRadius, aHeight, aSlot (−1 for satellites), aKind (1 house,
// 2 street, 3 city, 4 country/world, 5 data yard, 6 foundry), aSeed, aStreet (1 while any house on the plate's street
// is halted: a state read), aDye (the street's rim dye, DESIGN §2b.3), aSage (the last settle that ticked the rim).
// Two draw calls at any size.

import * as THREE from 'three';
import type { NodeId, Stage } from '../contract/state.ts';
import { dyeFor } from '../layout/dyes.ts';
import type { BulbLayout } from '../layout/layoutBulbs.ts';
import type { Store } from '../store/Store.ts';
import { plateGeometry } from './plateGeometry.ts';
import { TILE_FRAG, TILE_VERT } from './shaders/tile.glsl.ts';
import type { SharedUniforms } from './uniforms.ts';

export const KIND: Record<Stage, number> = { House: 1, Street: 2, City: 3, Country: 4, World: 4 };
export const KIND_YARD = 5, KIND_FOUNDRY = 6;
/**
 * Rim gain over §7.3's amplitudes (0.05 / 0.03 / 0.015 × fog). At the literal values a house at Φ 0.9 moves its rim by
 * 3 cm, invisible at any altitude; 4 makes Φ 0.9 read as a wobble and Φ 0.56 as a coastline. One number to tune.
 */
export const EDGE_GAIN = 4;
export const SPECKS_PER_PLATE = 6;

export interface Tile { cx: number; cz: number; r: number; kind: number; slot: number; id: NodeId | null; street: NodeId | null; base: number; top: number; seed: number }

/** The tile list for a layout: pure, so tests can count and order it. */
export function tilesFor(layout: BulbLayout, store: Pick<Store, 'slots'>): Tile[] {
  const tiles: Tile[] = [];
  for (const p of layout.plates.values()) {
    const street = p.stage === 'Street' ? p.id : p.stage === 'House' ? p.parent : null;
    tiles.push({ cx: p.cx, cz: p.cz, r: p.r, kind: KIND[p.stage], slot: store.slots.peek(p.id), id: p.id, street, base: p.base, top: p.top, seed: p.seed });
  }
  return tiles; // foundries and data yards stand on the city plate (DESIGN §2c.1.3): they are buildings, not plates
}

/** The ground beyond every plate: dark earth #1c1610 with faint contour rings every 8 m, never black (§2c.1.3). */
export function buildGround(extent: number): THREE.Mesh {
  const mat = new THREE.MeshLambertMaterial({ color: '#1c1610' });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vGround;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vGround;')
      .replace('#include <color_fragment>', `#include <color_fragment>
  float d = length(vGround) / 8.0 + 0.35 * sin(atan(vGround.y, vGround.x) * 3.0 + length(vGround) * 0.02);
  float w = fwidth(d);
  float ring = 1.0 - smoothstep(0.0, 1.5 * w + 0.02, abs(fract(d) - 0.5) - 0.46);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.145, 0.114, 0.082), ring * 0.4); // faint: a contour, not a road`);
  };
  const m = new THREE.Mesh(new THREE.CircleGeometry(Math.max(90, extent * 2.4), 96).rotateX(-Math.PI / 2), mat);
  m.position.y = -0.02;
  m.receiveShadow = true;
  m.name = 'ground';
  return m;
}

export class TileMesh {
  mesh: THREE.InstancedMesh | null = null;
  specks: THREE.InstancedMesh | null = null;
  tiles: Tile[] = [];
  readonly group = new THREE.Group();
  readonly material: THREE.ShaderMaterial;
  readonly speckMaterial: THREE.ShaderMaterial;
  private readonly geometry = plateGeometry();
  private readonly speckGeometry = plateGeometry(10);
  private street: THREE.InstancedBufferAttribute | null = null;
  private sage: THREE.InstancedBufferAttribute | null = null;

  constructor(uniforms: SharedUniforms) {
    const u = uniforms as unknown as Record<string, THREE.IUniform>;
    this.material = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: TILE_VERT, fragmentShader: TILE_FRAG });
    this.speckMaterial = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: TILE_VERT, fragmentShader: TILE_FRAG, defines: { SPECK: 1 } });
    this.group.name = 'plates';
  }

  /** Rebuild the instances (only when the layout changed). */
  build(layout: BulbLayout, store: Store): THREE.Group {
    this.tiles = tilesFor(layout, store);
    this.group.clear();
    this.mesh?.geometry.dispose();
    this.specks?.geometry.dispose();
    this.mesh = this.instance(this.geometry.clone(), this.material, this.tiles, 1);
    const speckable = this.tiles.filter((t) => t.slot >= 0);
    this.specks = this.instance(this.speckGeometry.clone(), this.speckMaterial, speckable, SPECKS_PER_PLATE);
    this.street = this.mesh.geometry.getAttribute('iB') as THREE.InstancedBufferAttribute;
    this.sage = this.mesh.geometry.getAttribute('iC') as THREE.InstancedBufferAttribute;
    this.group.add(buildGround(layout.radius), this.mesh, this.specks);
    return this.group;
  }

  private instance(g: THREE.BufferGeometry, mat: THREE.ShaderMaterial, tiles: Tile[], per: number): THREE.InstancedMesh {
    const n = Math.max(1, tiles.length * per);
    const iA = new Float32Array(n * 4), iB = new Float32Array(n * 4), iC = new Float32Array(n * 4), iD = new Float32Array(n * 4);
    const c = new THREE.Color();
    let i = 0;
    for (const t of tiles) {
      c.set(t.street === null ? '#4a3826' : dyeFor(t.street)); // sRGB; the shader linearises
      for (let k = 0; k < per; k++, i++) {
        iA.set([t.cx, t.cz, t.r, t.top], i * 4);
        iB.set([t.slot, t.kind, t.seed, 0], i * 4);
        iC.set([c.r, c.g, c.b, -1e9], i * 4);
        iD.set([t.base, k, 0, 0], i * 4);
      }
    }
    for (const name of ['normal', 'ang', 'rho', 'side']) g.deleteAttribute(name); // packed into vtx (16 attribute slots)
    g.setAttribute('iA', new THREE.InstancedBufferAttribute(iA, 4));
    const b = new THREE.InstancedBufferAttribute(iB, 4); b.setUsage(THREE.DynamicDrawUsage); g.setAttribute('iB', b);
    const cc = new THREE.InstancedBufferAttribute(iC, 4); cc.setUsage(THREE.DynamicDrawUsage); g.setAttribute('iC', cc);
    g.setAttribute('iD', new THREE.InstancedBufferAttribute(iD, 4));
    const mesh = new THREE.InstancedMesh(g, mat, n);
    mesh.count = tiles.length * per;
    mesh.frustumCulled = false; // placement is in the shader; the identity instance matrices say nothing about bounds
    return mesh;
  }

  /** Per tick: which streets have a halted house (O(own plates)). */
  update(store: Store): void {
    if (!this.street) return;
    const halted = new Set<NodeId>();
    for (const t of this.tiles) if (t.id !== null && t.street !== null && t.kind === 1 && store.node(t.id)?.status === 'halted') halted.add(t.street);
    const arr = this.street.array as Float32Array;
    let dirty = false;
    this.tiles.forEach((t, i) => { const v = t.street !== null && halted.has(t.street) ? 1 : 0; if (arr[i * 4 + 3] !== v) { arr[i * 4 + 3] = v; dirty = true; } });
    if (dirty) this.street.needsUpdate = true;
  }

  /** A settle: tick this node's rim --sage for 300 ms from t (DESIGN §6, §7). */
  tickSage(id: NodeId, t: number): void {
    if (!this.sage) return;
    const i = this.tiles.findIndex((x) => x.id === id);
    if (i < 0) return;
    (this.sage.array as Float32Array)[i * 4 + 3] = t;
    this.sage.needsUpdate = true;
  }

  dispose(): void { this.mesh?.geometry.dispose(); this.specks?.geometry.dispose(); this.material.dispose(); this.speckMaterial.dispose(); }
}
