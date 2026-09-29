// The bulb layout (DESIGN §2c, ARCHITECTURE §7.3): a node is a round plate; its children bud from its rim, smaller,
// the way bulbs bud from the Mandelbrot cardioid, by the same rule at every scale. Pure and keyed by NodeId: the
// same (id, parent, stage) triples give the same layout in any array order, so a take can be re-shot frame for frame.
//
// DESIGN §2c.1 (the composition fix): children bud all the way round the rim except the attachment arc (±35° about
// the direction of the parent); the root uses the whole circle. A parent's radius is the smallest that seats them,
// R = max(2.2·r, n·reach·1.15/π), and child i (ascending id) sits at R + 0.6·r from the parent's centre (a 0.4·r
// overlap, so each bulb visibly grows out of the rim). One deviation, written down: §2c.1 seats by the child's radius
// r; seated that way, neighbouring streets' houses collide (six streets of eight: 29 m reach each, 53 m apart), so the
// seating term uses each child's reach, r + 1.6·(its own largest child), which equals r for a leaf.
// Terraces: each generation stands 0.35 m above its parent (a 0.25 m wall and a bevel), city lowest.

import type { NodeId, NodeView, Stage } from '../contract/state.ts';

export interface Plate {
  id: NodeId; parent: NodeId | null; stage: Stage;
  cx: number; cz: number; r: number;
  /** Angle of attachment on the parent (radians; 0 for the root): also this plate's outward direction. */
  theta: number;
  /** hash(id) in 0–1. */
  seed: number;
  depth: number;
  /** Terrace: the plate stands from `base` to `top` (metres); each generation 0.35 m above its parent. */
  base: number;
  top: number;
}
/** Foundries and data yards (DESIGN §2c.1.3): they stand on the city plate between the streets' attachments. */
export interface Satellite { kind: 'foundry' | 'yard'; city: NodeId; cx: number; cz: number; r: number; theta: number; seed: number }
export interface BulbLayout {
  plates: Map<NodeId, Plate>;
  root: NodeId | null;
  /** Extent: the farthest plate edge from the root's centre (metres). */
  radius: number;
  satellites: Satellite[];
  /** Every root (Stage 5: the world's countries) by ascending id, its centre and extent. The first is `root`, at 0, 0. */
  trees: Tree[];
}
export interface Tree { id: NodeId; cx: number; cz: number; extent: number }

export const HOUSE_R = 6.5;
/** Half-width of the attachment arc no child may use (DESIGN §2c.1). */
export const ATTACH = (35 * Math.PI) / 180;
export const TERRACE = 0.35;
/** The smallest parent radius that seats n children of radius r and reach `reach` round its rim (DESIGN §2c.1). */
export const seatRadius = (n: number, r: number, reach = r): number => Math.max(2.2 * r, (n * reach * 1.15) / Math.PI);
export const topAt = (depth: number): number => TERRACE * (depth + 1);

type Shape = Pick<NodeView, 'id' | 'parent' | 'stage'>;

/** A deterministic hash of a NodeId (ids < 2^52) into [0, 1). */
export function seedOf(id: number): number {
  const lo = id % 4294967296, hi = Math.floor(id / 4294967296);
  let h = Math.imul(lo ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(hi + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const EMPTY: BulbLayout = { plates: new Map(), root: null, radius: 0, satellites: [], trees: [] };

export function layoutBulbs(nodes: readonly Shape[]): BulbLayout {
  if (nodes.length === 0) return { ...EMPTY, plates: new Map(), satellites: [], trees: [] };
  const byParent = new Map<NodeId | null, Shape[]>();
  for (const n of nodes) { const l = byParent.get(n.parent); if (l) l.push(n); else byParent.set(n.parent, [n]); }
  for (const l of byParent.values()) l.sort((a, b) => a.id - b.id);
  const kids = (id: NodeId) => byParent.get(id) ?? [];
  const roots = byParent.get(null);
  if (!roots?.length) return { ...EMPTY, plates: new Map(), satellites: [], trees: [] };

  // Leaf-up radii and reaches (iterative post-order, so a deep graph cannot overflow the stack).
  const radius = new Map<NodeId, number>(), reach = new Map<NodeId, number>();
  const order: Shape[] = [];
  const stack: Shape[] = [...roots];
  while (stack.length) { const n = stack.pop()!; order.push(n); for (const c of kids(n.id)) stack.push(c); }
  for (let i = order.length - 1; i >= 0; i--) {
    const n = order[i];
    const cs = kids(n.id);
    if (cs.length === 0) { radius.set(n.id, HOUSE_R); reach.set(n.id, HOUSE_R); continue; }
    const r = Math.max(...cs.map((c) => radius.get(c.id)!)), rc = Math.max(...cs.map((c) => reach.get(c.id)!));
    const R = seatRadius(cs.length, r, rc);
    radius.set(n.id, R);
    reach.set(n.id, R + 1.6 * r);
  }

  // Top-down placement: the root round its whole rim, every other plate round its rim minus the attachment arc. Several
  // roots (the world's countries) stand apart along +x on the flat ground, six extents clear, so one country's
  // relief never shows in another's frame; at the World they are beacons on the globe instead (scene/atlas/globe.ts).
  const plates = new Map<NodeId, Plate>();
  const trees: Tree[] = [];
  for (const root of roots) {
    const placed = placeTree(root);
    const prev = trees[trees.length - 1];
    const cx = prev ? prev.cx + 6 * (prev.extent + placed.extent) : 0;
    for (const id of placed.ids) plates.get(id)!.cx += cx;
    trees.push({ id: root.id, cx, cz: 0, extent: placed.extent });
  }

  function placeTree(root: Shape): { ids: NodeId[]; extent: number } {
    plates.set(root.id, { id: root.id, parent: null, stage: root.stage, cx: 0, cz: 0, r: radius.get(root.id)!, theta: 0, seed: seedOf(root.id), depth: 0, base: 0, top: topAt(0) });
    let extent = radius.get(root.id)!;
    const ids: NodeId[] = [root.id];
    const queue: NodeId[] = [root.id];
    while (queue.length) {
      const pid = queue.shift()!;
      const p = plates.get(pid)!;
      const cs = kids(pid);
      const n = cs.length;
      const span = p.parent === null ? 2 * Math.PI : 2 * Math.PI - 2 * ATTACH;
      const start = p.parent === null ? p.theta : p.theta + Math.PI + ATTACH; // just past the arc that faces the parent
      cs.forEach((c, i) => {
        const s = seedOf(c.id);
        // A small seeded jitter (±1/24 of the spacing): larger, and neighbours seated at the minimum radius touch.
        const theta = start + (span * (i + (p.parent === null ? 0 : 0.5))) / n + ((s * 2 - 1) * span) / (24 * n);
        const r = radius.get(c.id)!;
        const d = p.r + 0.6 * r;
        const depth = p.depth + 1;
        const plate: Plate = { id: c.id, parent: pid, stage: c.stage, cx: p.cx + d * Math.cos(theta), cz: p.cz + d * Math.sin(theta), r, theta, seed: s, depth, base: p.top, top: topAt(depth) };
        plates.set(c.id, plate);
        extent = Math.max(extent, Math.hypot(plate.cx, plate.cz) + r);
        ids.push(c.id);
        queue.push(c.id);
      });
  }
  return { ids, extent };
  }

  // Foundries and data yards on every city plate, one between each pair of neighbouring streets, alternating. A city
  // that buds from a country leaves the arc facing its parent empty (its streets never bud there either).
  const satellites: Satellite[] = [];
  for (const cp of plates.values()) {
    if (cp.stage !== 'City') continue;
    const angles = kids(cp.id).map((c) => { const k = plates.get(c.id)!; return Math.atan2(k.cz - cp.cz, k.cx - cp.cx); }).sort((a, b) => a - b);
    const r = Math.min(0.16 * cp.r, 1.4 * HOUSE_R);
    const d = cp.r - r - 1.5;
    const parent = cp.parent === null ? undefined : plates.get(cp.parent);
    const toParent = parent ? Math.atan2(parent.cz - cp.cz, parent.cx - cp.cx) : null;
    let n = 0;
    angles.forEach((a, i) => {
      const next = i + 1 < angles.length ? angles[i + 1] : angles[0] + 2 * Math.PI;
      if (toParent !== null) { // skip the gap that holds the direction to the parent: the attachment arc
        const k = a + ((((toParent - a) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
        if (k < next) return;
      }
      const theta = (a + next) / 2;
      satellites.push({ kind: n % 2 === 0 ? 'foundry' : 'yard', city: cp.id, cx: cp.cx + d * Math.cos(theta), cz: cp.cz + d * Math.sin(theta), r, theta, seed: seedOf(cp.id + i + 1) });
      n++;
    });
  }
  return { plates, root: trees[0].id, radius: trees[0].extent, satellites, trees };
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
