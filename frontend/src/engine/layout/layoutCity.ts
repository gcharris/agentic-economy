// The city (ARCHITECTURE §7.2): a pure, deterministic hex layout keyed by
// NodeId. Same (id, parent, stage) triples → same city, whatever the array
// order; recomputed only when the (id, parent) set changes (layoutKey).

import type { NodeId, NodeView } from '../contract/state.ts';
import { cellKey, corners, ring, spiral, toWorld, type Axial } from './hex.ts';

export interface StreetLayout { ringFrom: number; ringTo: number; cells: Axial[] }
export interface Layout {
  cell: Map<NodeId, Axial>;
  streets: Map<NodeId, StreetLayout>;
  radius: number;
  ground: Axial[];
  dressing: { foundries: Axial[]; yards: Axial[] };
  /** The root node (The City in scenarios::city; Elm Street in scenarios::house); null for an empty graph. */
  root: NodeId | null;
}

type Shape = Pick<NodeView, 'id' | 'parent' | 'stage'>;

export const ORIGIN: Axial = { q: 0, r: 0 };

/** A hash over the sorted (id, parent) pairs: the reducer relays out only when it changes. */
export function layoutKey(nodes: readonly Pick<NodeView, 'id' | 'parent'>[]): string {
  const pairs = nodes.map((n) => `${n.id}:${n.parent ?? 'r'}`).sort();
  // FNV-1a over the joined pairs: cheap and stable across ticks
  let h = 0x811c9dc5;
  const s = pairs.join('|');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `${nodes.length}:${(h >>> 0).toString(16)}`;
}

export function layoutCity(nodes: readonly Shape[]): Layout {
  const empty: Layout = { cell: new Map(), streets: new Map(), radius: 0, ground: [], dressing: { foundries: [], yards: [] }, root: null };
  if (nodes.length === 0) return empty;

  // children by parent, ascending NodeId (stable, seed-derived); one O(n) pass then per-group sorts
  const byParent = new Map<NodeId | null, Shape[]>();
  for (const n of nodes) {
    const list = byParent.get(n.parent);
    if (list) list.push(n); else byParent.set(n.parent, [n]);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.id - b.id);
  const children = (p: NodeId): Shape[] => byParent.get(p) ?? [];

  const roots = byParent.get(null);
  if (!roots || roots.length === 0) return empty;
  const root = roots[0];

  const cell = new Map<NodeId, Axial>([[root.id, ORIGIN]]); // the Clearinghouse tile at 0,0
  const streets = root.stage === 'Street' ? [root] : children(root.id); // a root street lays its houses on ring 1
  const streetInfo = new Map<NodeId, StreetLayout>();
  let nextRing = 1;

  for (const s of streets) {
    const houses = children(s.id);
    const ringFrom = nextRing;
    let k = ringFrom;
    let ringCells = ring(ORIGIN, k);
    const rot = Number(BigInt(s.id) % BigInt(ringCells.length)); // the street's id turns its ring: same seed → same city
    let idx = rot;
    let onRing = 0;
    const cells: Axial[] = [];
    for (const h of houses) { // contiguous in spiral order; spill onto the next ring when this one is full
      if (onRing > 0 && onRing === ringCells.length) { k++; ringCells = ring(ORIGIN, k); idx = 0; onRing = 0; }
      const c = ringCells[idx % ringCells.length];
      cells.push(c); cell.set(h.id, c); idx++; onRing++;
    }
    if (s !== root) cell.set(s.id, cells[Math.floor(cells.length / 2)] ?? ringCells[rot]); // the street's marker: its middle house's cell
    streetInfo.set(s.id, { ringFrom, ringTo: k, cells });
    nextRing = k + 1;
  }

  const radius = nextRing - 1;
  const used = new Set<number>();
  for (const c of cell.values()) used.add(cellKey(c));
  const ground = spiral(ORIGIN, radius + 2).filter((c) => !used.has(cellKey(c)));
  const r1 = ring(ORIGIN, radius + 1), r2 = ring(ORIGIN, radius + 2);
  const dressing = { foundries: corners(radius + 1).map((i) => r1[i]), yards: corners(radius + 2).map((i) => r2[i]) };
  return { cell, streets: streetInfo, radius, ground, dressing, root: root.id };
}

/** The house on a tile faces the ring centre (its Door wall, local +x, points at (0,0)); the root tile faces +x. */
export function houseYaw(c: Axial): number {
  const w = toWorld(c);
  return w.x === 0 && w.z === 0 ? 0 : Math.atan2(w.z, -w.x);
}

/** The kerb stone: 5.0 m from the tile centre toward the ring centre; the kerb ribbon is the closed polyline through a ring's stones. */
export function kerbStone(c: Axial): { x: number; y: number; z: number } {
  const w = toWorld(c);
  const l = Math.hypot(w.x, w.z) || 1;
  return { x: w.x - (5 * w.x) / l, y: 0, z: w.z - (5 * w.z) / l };
}

export const cellOf = (layout: Layout | null, id: NodeId): Axial | null => layout?.cell.get(id) ?? null;

/** What SceneContext.layout exposes to the bands: the current layout plus the per-id helpers. */
export class LayoutHandle {
  current: Layout = layoutCity([]);
  key = '';
  cellOf(id: NodeId): Axial | null { return cellOf(this.current, id); }
  houseYaw(id: NodeId): number { const c = this.cellOf(id); return c ? houseYaw(c) : 0; }
  kerbStone(id: NodeId): { x: number; y: number; z: number } | null { const c = this.cellOf(id); return c ? kerbStone(c) : null; }
  /** Relays out only when the (id, parent) set changed; returns true when it did. */
  update(nodes: readonly Shape[]): boolean {
    const key = layoutKey(nodes);
    if (key === this.key) return false;
    this.key = key;
    this.current = layoutCity(nodes);
    return true;
  }
}
