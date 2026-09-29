// The bulb layout (DESIGN §2c and §2c.1): pure, leaf-up radii with HOUSE_R held, R = max(2.2r, n·reach·1.15/π),
// children on the parent's rim at R + 0.6·r all round it except the ±35° attachment arc, terraces of 0.35 m, no two
// plates of the city overlapping, foundries and yards on the city plate, and
// the 5,000-node city under 50 ms. layoutWorld (unchanged) keeps its beacon test.

import { describe, expect, test } from 'vitest';
import type { NodeView } from '../../src/engine/contract/state.ts';
import { ATTACH, attachPoint, HOUSE_R, layoutBulbs, rimPoint, seatRadius, TERRACE, yawToward, type Plate } from '../../src/engine/layout/layoutBulbs.ts';
import { layoutWorld, WORLD_RADIUS } from '../../src/engine/layout/layoutWorld.ts';
import { loadTrace } from '../helpers/assets.ts';

type Shape = Pick<NodeView, 'id' | 'parent' | 'stage'>;
const trace = loadTrace();
const streetNodes = trace.street[0].state.nodes;

function city(streets: number, houses: number, base = 1000): Shape[] {
  const out: Shape[] = [{ id: base, parent: null, stage: 'City' }];
  for (let s = 0; s < streets; s++) {
    const sid = base + 1 + s * (houses + 1);
    out.push({ id: sid, parent: base, stage: 'Street' });
    for (let h = 0; h < houses; h++) out.push({ id: sid + 1 + h, parent: sid, stage: 'House' });
  }
  return out;
}
const angleFrom = (c: Plate, p: Plate) => Math.atan2(c.cz - p.cz, c.cx - p.cx);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

describe('layoutBulbs', () => {
  test('pure: identical for any array order, and stable across all 30 street frames', () => {
    const a = layoutBulbs(streetNodes), b = layoutBulbs([...streetNodes].reverse());
    expect([...b.plates.entries()].sort(([x], [y]) => x - y)).toEqual([...a.plates.entries()].sort(([x], [y]) => x - y));
    for (const fr of trace.street) expect(layoutBulbs(fr.state.nodes).plates).toEqual(a.plates);
  });

  test('houses keep HOUSE_R; a parent is sized leaf-up; each child sits on the rim at R + 0.6·r', () => {
    const l = layoutBulbs(city(6, 8));
    const plates = [...l.plates.values()];
    for (const p of plates.filter((x) => x.stage === 'House')) expect(p.r).toBe(HOUSE_R);
    const street = plates.find((p) => p.stage === 'Street')!;
    expect(street.r).toBeCloseTo((8 * HOUSE_R * 1.15) / Math.PI, 9);   // 19.0 m for eight houses (§2c.1)
    expect(layoutBulbs(city(1, 6)).plates.get(1001)!.r).toBeCloseTo(2.2 * HOUSE_R, 9); // 14.3 m for six: 2.2·r governs
    const root = l.plates.get(l.root!)!;
    expect(root.r).toBeCloseTo(seatRadius(6, street.r, street.r + 1.6 * HOUSE_R), 9);
    for (const p of plates) expect(p.top - p.base).toBeCloseTo(p.parent === null ? TERRACE : TERRACE, 9);
    expect(l.plates.get(1001)!.base).toBeCloseTo(root.top, 9);
    for (const p of plates) {
      if (p.parent === null) continue;
      const parent = l.plates.get(p.parent)!;
      expect(Math.hypot(p.cx - parent.cx, p.cz - parent.cz)).toBeCloseTo(parent.r + 0.6 * p.r, 9);
      const at = attachPoint(p, parent);
      expect(Math.hypot(at.x - parent.cx, at.z - parent.cz)).toBeCloseTo(parent.r, 9);
    }
  });

  test('grandchildren bud all round their rim but the ±35° facing their parent; no two plates of the city overlap', () => {
    const l = layoutBulbs(city(6, 8));
    const plates = [...l.plates.values()];
    for (const h of plates.filter((p) => p.stage === 'House')) {
      const s = l.plates.get(h.parent!)!;
      const toParent = s.theta + Math.PI; // the street's parent lies back along its own outward direction
      expect(Math.abs(wrap(angleFrom(h, s) - toParent))).toBeGreaterThanOrEqual(ATTACH - 1e-9);
    }
    const nonRoot = plates.filter((p) => p.parent !== null);
    for (let i = 0; i < nonRoot.length; i++) for (let j = i + 1; j < nonRoot.length; j++) {
      const [a, b] = [nonRoot[i], nonRoot[j]];
      if (a.parent === b.id || b.parent === a.id) continue; // a bulb overlaps its own parent by design
      expect(Math.hypot(a.cx - b.cx, a.cz - b.cz), `${a.id}/${b.id}`).toBeGreaterThanOrEqual(0.98 * (a.r + b.r));
    }
  });

  test('foundries and yards stand on the city plate between the streets, alternating; a house run has none', () => {
    const l = layoutBulbs(city(6, 8));
    expect(l.satellites).toHaveLength(6);
    expect(l.satellites.map((s) => s.kind)).toEqual(['foundry', 'yard', 'foundry', 'yard', 'foundry', 'yard']);
    const root = l.plates.get(l.root!)!;
    for (const s of l.satellites) expect(Math.hypot(s.cx, s.cz) + s.r).toBeLessThanOrEqual(root.r);
    expect(layoutBulbs(trace.house[0].state.nodes).satellites).toHaveLength(0);
  });

  test('a house faces its street: its local +x points at the street centre', () => {
    const l = layoutBulbs(streetNodes);
    for (const p of l.plates.values()) {
      if (p.stage !== 'House') continue;
      const s = l.plates.get(p.parent!)!;
      const yaw = yawToward(p, s);
      const x = Math.cos(yaw), z = -Math.sin(yaw); // three: rotation.y θ sends +x to (cos θ, 0, −sin θ)
      const d = Math.hypot(s.cx - p.cx, s.cz - p.cz);
      expect(x).toBeCloseTo((s.cx - p.cx) / d, 9);
      expect(z).toBeCloseTo((s.cz - p.cz) / d, 9);
      const r = rimPoint(s, 0);
      expect(Math.hypot(r.x - s.cx, r.z - s.cz)).toBeCloseTo(s.r, 9);
    }
  });

  test('a 5,000-house city lays out in under 50 ms', () => {
    const nodes = city(50, 100);
    const t0 = performance.now();
    const l = layoutBulbs(nodes);
    expect(performance.now() - t0).toBeLessThan(50);
    expect(l.plates.size).toBe(nodes.length);
  });
});

test('layoutWorld: countries by ascending id on the 30° N circle', () => {
  const world = layoutWorld([{ id: 30, parent: null, stage: 'Country' }, { id: 10, parent: null, stage: 'Country' }, { id: 20, parent: null, stage: 'Country' }, { id: 99, parent: 10, stage: 'City' }]);
  expect(world.order).toEqual([10, 20, 30]);
  const b = [10, 20, 30].map((id) => world.beacons.get(id)!);
  for (const x of b) {
    expect(Math.hypot(x.x, x.y, x.z)).toBeCloseTo(WORLD_RADIUS, 6);
    expect(x.y).toBeCloseTo(WORLD_RADIUS * Math.sin(Math.PI / 6), 6);
  }
});
