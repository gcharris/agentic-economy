import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import type { NodeView } from '../../src/engine/contract/state.ts';
import { cellKey, distance, ring, spiral, toWorld } from '../../src/engine/layout/hex.ts';
import { houseYaw, kerbStone, layoutCity, layoutKey, LayoutHandle, type Layout } from '../../src/engine/layout/layoutCity.ts';
import { COUNTRY_HEX_SIZE, layoutCountry } from '../../src/engine/layout/layoutCountry.ts';
import { layoutWorld, WORLD_RADIUS } from '../../src/engine/layout/layoutWorld.ts';
import { fixturePath, loadTrace } from '../helpers/assets.ts';

const trace = loadTrace();
const streetNodes = trace.street[0].state.nodes;
const houseNodes = trace.house[0].state.nodes;

/** A readable, order-stable projection of a Layout for snapshots and equality. */
function flat(l: Layout) {
  return {
    root: l.root,
    radius: l.radius,
    cell: [...l.cell.entries()].sort((a, b) => a[0] - b[0]).map(([id, c]) => [id, c.q, c.r]),
    streets: [...l.streets.entries()].sort((a, b) => a[0] - b[0]).map(([id, s]) => [id, s.ringFrom, s.ringTo, s.cells.map((c) => `${c.q},${c.r}`).join(' ')]),
    ground: l.ground.length,
    foundries: l.dressing.foundries.map((c) => `${c.q},${c.r}`),
    yards: l.dressing.yards.map((c) => `${c.q},${c.r}`),
  };
}

/** Deterministic shuffle (LCG), no Math.random. */
function shuffled<T>(arr: readonly T[], seed: number): T[] {
  const out = [...arr];
  let s = seed >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe('layoutCity', () => {
  test('snapshot of layoutCity(trace.street[0].state.nodes)', () => {
    expect(flat(layoutCity(streetNodes))).toMatchSnapshot();
  });

  test('the recorded street: The City at (0,0); Elm Street lays its six houses contiguously on ring 1 by id, not by name', () => {
    const l = layoutCity(streetNodes);
    const city = streetNodes.find((n) => n.stage === 'City')!;
    const street = streetNodes.find((n) => n.stage === 'Street')!;
    const houses = streetNodes.filter((n) => n.stage === 'House').sort((a, b) => a.id - b.id);
    expect(l.root).toBe(city.id);
    expect(l.cell.get(city.id)).toEqual({ q: 0, r: 0 });
    const r1 = ring({ q: 0, r: 0 }, 1);
    const rot = Number(BigInt(street.id) % 6n);
    houses.forEach((h, i) => expect(l.cell.get(h.id)).toEqual(r1[(rot + i) % 6]));
    expect(l.streets.get(street.id)).toMatchObject({ ringFrom: 1, ringTo: 1 });
    expect(l.cell.get(street.id)).toEqual(l.streets.get(street.id)!.cells[3]); // the middle house's cell
    expect(l.radius).toBe(1);
    expect(l.ground).toHaveLength(37 - 7); // spiral(3) minus the seven used cells
    expect(l.dressing.foundries).toHaveLength(6);
    expect(l.dressing.yards).toHaveLength(6);
    for (const f of l.dressing.foundries) expect(distance({ q: 0, r: 0 }, f)).toBe(2);
    for (const y of l.dressing.yards) expect(distance({ q: 0, r: 0 }, y)).toBe(3);
  });

  test('the recorded house: a root street lays its one house on ring 1', () => {
    const l = layoutCity(houseNodes);
    const street = houseNodes.find((n) => n.stage === 'Street')!;
    const house = houseNodes.find((n) => n.stage === 'House')!;
    expect(l.root).toBe(street.id);
    expect(l.cell.get(street.id)).toEqual({ q: 0, r: 0 });
    expect(distance({ q: 0, r: 0 }, l.cell.get(house.id)!)).toBe(1);
    expect(l.streets.get(street.id)!.cells).toHaveLength(1);
  });

  test('array-order independence: identical for identical (id, parent, stage) triples', () => {
    const base = flat(layoutCity(streetNodes));
    for (const seed of [1, 2, 3, 42]) expect(flat(layoutCity(shuffled(streetNodes, seed)))).toEqual(base);
  });

  test('stability across all 30 street frames, and the layoutKey is unchanged', () => {
    const base = flat(layoutCity(streetNodes));
    const key = layoutKey(streetNodes);
    for (const f of trace.street) {
      expect(layoutKey(f.state.nodes)).toBe(key);
      expect(flat(layoutCity(f.state.nodes))).toEqual(base);
    }
    const handle = new LayoutHandle();
    expect(handle.update(trace.street[0].state.nodes)).toBe(true);
    for (const f of trace.street.slice(1)) expect(handle.update(f.state.nodes)).toBe(false);
  });

  test('pure: two calls give two equal but distinct results, no shared Maps', () => {
    const a = layoutCity(streetNodes), b = layoutCity(streetNodes);
    expect(a.cell).not.toBe(b.cell);
    expect(flat(a)).toEqual(flat(b));
    expect(layoutCity([])).toMatchObject({ root: null, radius: 0 });
  });

  test('a 5,000-node synthetic graph (labelled synthetic) lays out in < 50 ms', () => {
    const fixture = JSON.parse(readFileSync(fixturePath('synthetic-city-5000.json'), 'utf8')) as { synthetic: boolean; label: string; nodes: NodeView[] };
    expect(fixture.synthetic).toBe(true);
    expect(fixture.label).toMatch(/SYNTHETIC/);
    expect(fixture.nodes.length).toBeGreaterThanOrEqual(5000);
    layoutCity(fixture.nodes); // warm the JIT once
    let best = Infinity;
    let l: Layout = layoutCity([]);
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      l = layoutCity(fixture.nodes);
      best = Math.min(best, performance.now() - t0);
    }
    expect(best).toBeLessThan(50);
    expect(l.cell.size).toBe(fixture.nodes.length);
    // every house has its own cell; a street marker shares its middle house's cell
    const streetsOffRoot = [...l.streets.keys()].filter((s) => s !== l.root).length;
    expect(new Set([...l.cell.values()].map(cellKey)).size).toBe(l.cell.size - streetsOffRoot);
    for (const n of fixture.nodes) {
      if (n.stage !== 'House' || n.parent === null) continue;
      const s = l.streets.get(n.parent)!;
      const d = distance({ q: 0, r: 0 }, l.cell.get(n.id)!);
      expect(d).toBeGreaterThanOrEqual(s.ringFrom);
      expect(d).toBeLessThanOrEqual(s.ringTo);
    }
  });

  test('houseYaw points every house\'s local +x (its Door wall) at the origin; the root faces +x', () => {
    expect(houseYaw({ q: 0, r: 0 })).toBe(0);
    for (const c of spiral({ q: 0, r: 0 }, 5).slice(1)) {
      const w = toWorld(c);
      const yaw = houseYaw(c);
      // Three.js rotation.y = yaw maps local +x to world (cos yaw, 0, −sin yaw)
      const dx = Math.cos(yaw), dz = -Math.sin(yaw);
      const l = Math.hypot(w.x, w.z);
      const dot = (dx * -w.x + dz * -w.z) / l;
      expect(dot).toBeCloseTo(1, 9);
    }
  });

  test('kerbStone sits 5 m from the tile centre toward the ring centre', () => {
    for (const c of ring({ q: 0, r: 0 }, 2)) {
      const w = toWorld(c), k = kerbStone(c);
      expect(Math.hypot(k.x - w.x, k.z - w.z)).toBeCloseTo(5, 9);
      expect(Math.hypot(k.x, k.z)).toBeCloseTo(Math.hypot(w.x, w.z) - 5, 9);
    }
    expect(kerbStone({ q: 0, r: 0 })).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('layoutCountry and layoutWorld', () => {
  const country: Pick<NodeView, 'id' | 'parent' | 'stage'>[] = [
    { id: 50, parent: null, stage: 'Country' },
    { id: 7, parent: 50, stage: 'City' }, { id: 9, parent: 50, stage: 'City' }, { id: 3, parent: 50, stage: 'City' },
    { id: 11, parent: 50, stage: 'City' }, { id: 13, parent: 50, stage: 'City' }, { id: 15, parent: 50, stage: 'City' }, { id: 17, parent: 50, stage: 'City' },
  ];
  test('the Country at (0,0), cities on rings by ascending id, HEX_SIZE × 7', () => {
    const l = layoutCountry(country);
    expect(COUNTRY_HEX_SIZE).toBe(42);
    expect(l.country).toBe(50);
    expect(l.cell.get(50)).toEqual({ q: 0, r: 0 });
    expect(l.radius).toBe(2);
    const r1 = ring({ q: 0, r: 0 }, 1);
    expect(l.cell.get(3)).toEqual(r1[0]);
    expect(l.cell.get(7)).toEqual(r1[1]);
    expect(distance({ q: 0, r: 0 }, l.cell.get(17)!)).toBe(2);
    expect(layoutCountry(shuffled(country, 9)).cell).toEqual(l.cell);
  });
  test('countries by ascending id evenly on the 30° N circle of a sphere R 6,000', () => {
    const world = layoutWorld([{ id: 30, parent: null, stage: 'Country' }, { id: 10, parent: null, stage: 'Country' }, { id: 20, parent: null, stage: 'Country' }, { id: 99, parent: 10, stage: 'City' }]);
    expect(world.order).toEqual([10, 20, 30]);
    const b = [10, 20, 30].map((id) => world.beacons.get(id)!);
    for (const x of b) {
      expect(Math.hypot(x.x, x.y, x.z)).toBeCloseTo(WORLD_RADIUS, 6);
      expect(x.y).toBeCloseTo(WORLD_RADIUS * Math.sin(Math.PI / 6), 6);
    }
    expect(b[1].lon - b[0].lon).toBeCloseTo((2 * Math.PI) / 3, 9);
    expect(b[2].lon - b[1].lon).toBeCloseTo((2 * Math.PI) / 3, 9);
  });
});
