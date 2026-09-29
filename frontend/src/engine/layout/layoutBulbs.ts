// The bulb layout (DESIGN §2c, ARCHITECTURE §7.3): a node is a round plate; its children bud from its rim, smaller,
// the way bulbs bud from the Mandelbrot cardioid, by the same rule at every scale. Pure and keyed by NodeId: the
// same (id, parent, stage) triples give the same layout in any array order, so a take can be re-shot frame for frame.
//
// Radii leaf-up: a house keeps HOUSE_R at every zoom; a parent's radius follows from its children,
// R = max(r_child) / f(n_eff). Placement top-down: child i (ascending id) at angle θᵢ on the parent's rim, centre at
// R + 0.6·r from the parent's centre (a 0.4·r overlap, so each bulb visibly grows out of the rim). The root spreads its
// children round the whole circle; any other plate buds only within θ₀ ± 100° of its own outward direction.
// One deviation from §7.3, written down: children confined to a 200° arc would overlap at f(n), so a non-root parent
// sizes for n_eff = n · 360 / 200 (the bulbs then just touch, as in the reference set, instead of piling up).

import type { NodeId, NodeView, Stage } from '../contract/state.ts';

export interface Plate {
  id: NodeId; parent: NodeId | null; stage: Stage;
  cx: number; cz: number; r: number;
  /** Angle of attachment on the parent (radians; 0 for the root): also this plate's outward direction. */
  theta: number;
  /** hash(id) in 0–1. */
  seed: number;
  depth: number;
}
/** Foundries and data yards: small satellite plates in the unused arc gaps of a city's rim (DESIGN §2c.4). */
export interface Satellite { kind: 'foundry' | 'yard'; cx: number; cz: number; r: number; theta: number; seed: number }
export interface BulbLayout {
  plates: Map<NodeId, Plate>;
  root: NodeId | null;
  /** Extent: the farthest plate edge from the root's centre (metres). */
  radius: number;
  satellites: Satellite[];
}

export const HOUSE_R = 6.5;
export const ARC = (100 * Math.PI) / 180;
export const f = (n: number): number => Math.min(0.42, 0.85 / Math.sqrt(Math.max(n, 1)));
/** Plate tops by stage: each generation stands a little proud of its parent, so the overlap reads as budding. */
export const PLATE_TOP: Record<Stage, number> = { World: 0.05, Country: 0.1, City: 0.15, Street: 0.3, House: 0.45 };

type Shape = Pick<NodeView, 'id' | 'parent' | 'stage'>;

/** A deterministic hash of a NodeId (ids < 2^52) into [0, 1). */
export function seedOf(id: number): number {
  const lo = id % 4294967296, hi = Math.floor(id / 4294967296);
  let h = Math.imul(lo ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(hi + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const EMPTY: BulbLayout = { plates: new Map(), root: null, radius: 0, satellites: [] };

export function layoutBulbs(nodes: readonly Shape[]): BulbLayout {
  if (nodes.length === 0) return { ...EMPTY, plates: new Map(), satellites: [] };
  const byParent = new Map<NodeId | null, Shape[]>();
  for (const n of nodes) { const l = byParent.get(n.parent); if (l) l.push(n); else byParent.set(n.parent, [n]); }
  for (const l of byParent.values()) l.sort((a, b) => a.id - b.id);
  const kids = (id: NodeId) => byParent.get(id) ?? [];
  const roots = byParent.get(null);
  if (!roots?.length) return { ...EMPTY, plates: new Map(), satellites: [] };
  const root = roots[0];

  // Leaf-up radii (iterative post-order, so a deep graph cannot overflow the stack).
  const radius = new Map<NodeId, number>();
  const order: Shape[] = [];
  const stack: Shape[] = [root];
  while (stack.length) { const n = stack.pop()!; order.push(n); for (const c of kids(n.id)) stack.push(c); }
  for (let i = order.length - 1; i >= 0; i--) {
    const n = order[i];
    const cs = kids(n.id);
    if (cs.length === 0) { radius.set(n.id, HOUSE_R); continue; }
    const nEff = n === root ? cs.length : (cs.length * 360) / 200;
    radius.set(n.id, Math.max(...cs.map((c) => radius.get(c.id)!)) / f(nEff));
  }

  // Top-down placement.
  const plates = new Map<NodeId, Plate>();
  plates.set(root.id, { id: root.id, parent: null, stage: root.stage, cx: 0, cz: 0, r: radius.get(root.id)!, theta: 0, seed: seedOf(root.id), depth: 0 });
  let extent = radius.get(root.id)!;
  const queue: NodeId[] = [root.id];
  while (queue.length) {
    const pid = queue.shift()!;
    const p = plates.get(pid)!;
    const cs = kids(pid);
    const n = cs.length;
    cs.forEach((c, i) => {
      const s = seedOf(c.id);
      const jitter = (s * 2 - 1);
      const theta = p.parent === null
        ? p.theta + (2 * Math.PI * i) / n + (jitter * Math.PI) / (4 * n)
        : p.theta - ARC + (2 * ARC * (i + 0.5)) / n + (jitter * ARC) / (4 * n);
      const r = radius.get(c.id)!;
      const d = p.r + 0.6 * r;
      const plate: Plate = { id: c.id, parent: pid, stage: c.stage, cx: p.cx + d * Math.cos(theta), cz: p.cz + d * Math.sin(theta), r, theta, seed: s, depth: p.depth + 1 };
      plates.set(c.id, plate);
      extent = Math.max(extent, Math.hypot(plate.cx, plate.cz) + r);
      queue.push(c.id);
    });
  }

  // Satellites in the arc gaps of a city's rim: one per gap, foundry and data yard alternating.
  const satellites: Satellite[] = [];
  const rp = plates.get(root.id)!;
  if (root.stage === 'City') {
    const angles = kids(root.id).map((c) => plates.get(c.id)!.theta).sort((a, b) => a - b);
    const childR = Math.max(HOUSE_R, ...kids(root.id).map((c) => radius.get(c.id)!));
    angles.forEach((a, i) => {
      const next = i + 1 < angles.length ? angles[i + 1] : angles[0] + 2 * Math.PI;
      const theta = (a + next) / 2;
      const r = Math.min(0.3 * childR, 0.35 * rp.r, 2.2 * HOUSE_R);
      const d = rp.r + 0.6 * r;
      satellites.push({ kind: i % 2 === 0 ? 'foundry' : 'yard', cx: d * Math.cos(theta), cz: d * Math.sin(theta), r, theta, seed: seedOf(root.id + i + 1) });
      extent = Math.max(extent, d + r);
    });
  }
  return { plates, root: root.id, radius: extent, satellites };
}

/** Where a bulb meets its parent's rim. */
export function attachPoint(p: Plate, parent: Plate): { x: number; z: number } {
  return { x: parent.cx + parent.r * Math.cos(p.theta), z: parent.cz + parent.r * Math.sin(p.theta) };
}

/** A point on a plate's rim (kerb stones, slots, tubes). */
export function rimPoint(p: Plate, theta: number, k = 1): { x: number; z: number } {
  return { x: p.cx + k * p.r * Math.cos(theta), z: p.cz + k * p.r * Math.sin(theta) };
}

/** The yaw that turns a plate's local +x (a house's Door wall) toward its parent's centre; 0 for the root. */
export function yawToward(p: Plate, parent: Plate | undefined): number {
  if (!parent) return 0;
  return Math.atan2(-(parent.cz - p.cz), parent.cx - p.cx);
}

/** A hash over the sorted (id, parent) pairs: the reducer relays out only when it changes. */
export function layoutKey(nodes: readonly Pick<NodeView, 'id' | 'parent'>[]): string {
  const pairs = nodes.map((n) => `${n.id}:${n.parent ?? 'r'}`).sort();
  let h = 0x811c9dc5;
  const s = pairs.join('|');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `${nodes.length}:${(h >>> 0).toString(16)}`;
}

/** What SceneContext.layout exposes to the bands: the current layout plus the per-id helpers. */
export class LayoutHandle {
  current: BulbLayout = { ...EMPTY, plates: new Map(), satellites: [] };
  key = '';
  plateOf(id: NodeId): Plate | undefined { return this.current.plates.get(id); }
  parentOf(id: NodeId): Plate | undefined { const p = this.current.plates.get(id); return p?.parent == null ? undefined : this.current.plates.get(p.parent); }
  yawOf(id: NodeId): number { const p = this.plateOf(id); return p ? yawToward(p, this.parentOf(id)) : 0; }
  /** Relays out only when the (id, parent) set changed; returns true when it did. */
  update(nodes: readonly Shape[]): boolean {
    const key = layoutKey(nodes);
    if (key === this.key) return false;
    this.key = key;
    this.current = layoutBulbs(nodes);
    return true;
  }
}
