// The tile mesh (ARCHITECTURE §6.1, §11): one InstancedMesh of hex prisms for the whole city: the Clearinghouse,
// every house cell, the ground spiral and the set dressing. Per instance: aSlot (−1 for ground and dressing),
// aAxial, aKind (0 ground, 1 house, 3 Clearinghouse, 5 dressing), aSeed, and aStreet (1 while any house on the
// tile's street is halted: a state read, not a memory), aDye (the street's rim dye, DESIGN §2b.3) and aSage (the
// time of the last settle that ticked this rim). One draw call at any size.

import * as THREE from 'three';
import type { NodeId } from '../contract/state.ts';
import { toWorld, type Axial } from '../layout/hex.ts';
import type { Layout } from '../layout/layoutCity.ts';
import type { Store } from '../store/Store.ts';
import { hexPrism } from './hexGeometry.ts';
import { dyeFor } from '../layout/dyes.ts';
import { TILE_FRAG, TILE_VERT } from './shaders/tile.glsl.ts';
import type { SharedUniforms } from './uniforms.ts';

export const KIND = { ground: 0, house: 1, clearinghouse: 3, dressing: 5 } as const;
export const HEIGHT = { ground: 0.6, house: 1.2, clearinghouse: 2.0 } as const;

const seedOf = (id: number) => { let h = (id % 2147483647) >>> 0; h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; return (h % 10007) / 10007; };

export interface Tile { axial: Axial; kind: number; slot: number; id: NodeId | null; street: NodeId | null; height: number }

/** The tile list for a layout: pure, so tests can count and order it. */
export function tilesFor(layout: Layout, store: Pick<Store, 'node' | 'slots'>): Tile[] {
  const tiles: Tile[] = [];
  const streetOf = new Map<string, NodeId>();
  for (const [sid, st] of layout.streets) for (const c of st.cells) streetOf.set(`${c.q},${c.r}`, sid);
  const seen = new Set<string>();
  for (const [id, c] of layout.cell) {
    const key = `${c.q},${c.r}`;
    const n = store.node(id);
    if (!n) continue;
    const isRoot = id === layout.root;
    if (!isRoot && n.stage !== 'House') continue; // street markers share their middle house's cell
    if (seen.has(key)) continue;
    seen.add(key);
    tiles.push({ axial: c, kind: isRoot ? KIND.clearinghouse : KIND.house, slot: store.slots.peek(id), id, street: streetOf.get(key) ?? null, height: isRoot ? HEIGHT.clearinghouse : HEIGHT.house });
  }
  const dress = new Set([...layout.dressing.foundries, ...layout.dressing.yards].map((c) => `${c.q},${c.r}`));
  for (const c of layout.ground) {
    const key = `${c.q},${c.r}`;
    if (seen.has(key)) continue;
    tiles.push({ axial: c, kind: dress.has(key) ? KIND.dressing : KIND.ground, slot: -1, id: null, street: null, height: HEIGHT.ground });
  }
  return tiles;
}

export class TileMesh {
  mesh: THREE.InstancedMesh | null = null;
  tiles: Tile[] = [];
  private readonly geometry = hexPrism();
  readonly material: THREE.ShaderMaterial;
  private street: THREE.InstancedBufferAttribute | null = null;
  private sage: THREE.InstancedBufferAttribute | null = null;

  constructor(uniforms: SharedUniforms) {
    this.material = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: uniforms as unknown as Record<string, THREE.IUniform>, vertexShader: TILE_VERT, fragmentShader: TILE_FRAG });
  }

  /** Rebuild the instances (only when the layout changed). */
  build(layout: Layout, store: Store): THREE.InstancedMesh {
    this.tiles = tilesFor(layout, store);
    const n = this.tiles.length;
    const g = this.geometry.clone();
    const slot = new Float32Array(n), axial = new Float32Array(n * 2), kind = new Float32Array(n), seed = new Float32Array(n), street = new Float32Array(n);
    const dye = new Float32Array(n * 3), sage = new Float32Array(n).fill(-1e9);
    const c = new THREE.Color();
    const mesh = new THREE.InstancedMesh(g, this.material, n);
    const m = new THREE.Matrix4();
    this.tiles.forEach((t, i) => {
      const w = toWorld(t.axial);
      m.makeScale(0.985, t.height, 0.985).setPosition(w.x, 0, w.z); // a hairline between tiles
      mesh.setMatrixAt(i, m);
      c.set(t.street === null ? '#4a3826' : dyeFor(t.street)); dye.set([c.r, c.g, c.b], i * 3); // sRGB; the shader linearises
      slot[i] = t.slot; axial.set([t.axial.q, t.axial.r], i * 2); kind[i] = t.kind; seed[i] = seedOf(t.id ?? (t.axial.q * 7919 + t.axial.r * 104729));
    });
    g.setAttribute('aSlot', new THREE.InstancedBufferAttribute(slot, 1));
    g.setAttribute('aAxial', new THREE.InstancedBufferAttribute(axial, 2));
    g.setAttribute('aKind', new THREE.InstancedBufferAttribute(kind, 1));
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    this.street = new THREE.InstancedBufferAttribute(street, 1);
    this.street.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aStreet', this.street);
    g.setAttribute('aDye', new THREE.InstancedBufferAttribute(dye, 3));
    this.sage = new THREE.InstancedBufferAttribute(sage, 1);
    this.sage.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aSage', this.sage);
    mesh.frustumCulled = false;
    mesh.name = 'tiles';
    this.mesh?.geometry.dispose();
    this.mesh = mesh;
    return mesh;
  }

  /** Per tick: which streets have a halted house (O(own tiles)). */
  update(store: Store): void {
    if (!this.street) return;
    const halted = new Set<NodeId>();
    for (const t of this.tiles) if (t.id !== null && t.street !== null && store.node(t.id)?.status === 'halted') halted.add(t.street);
    const a = this.street.array as Float32Array;
    let dirty = false;
    this.tiles.forEach((t, i) => { const v = t.street !== null && halted.has(t.street) ? 1 : 0; if (a[i] !== v) { a[i] = v; dirty = true; } });
    if (dirty) this.street.needsUpdate = true;
  }

  /** A settle: tick this node's rim --sage for 300 ms from t (DESIGN §7, the NETTED pulse's fourth beat). */
  tickSage(id: NodeId, t: number): void {
    if (!this.sage) return;
    const i = this.tiles.findIndex((x) => x.id === id);
    if (i < 0) return;
    (this.sage.array as Float32Array)[i] = t;
    this.sage.needsUpdate = true;
  }

  dispose(): void { this.mesh?.geometry.dispose(); this.material.dispose(); }
}
