// The bulb layout (DESIGN §2c, ARCHITECTURE §7.3): pure, leaf-up radii with HOUSE_R held, children on the parent's
// rim at R + 0.6·r, grandchildren within ±100° of outward, siblings never overlapping, satellites in the gaps, and
// the 5,000-node city under 50 ms. layoutWorld (unchanged) keeps its beacon test.

import { describe, expect, test } from 'vitest';
import type { NodeView } from '../../src/engine/contract/state.ts';
import { ARC, attachPoint, f, HOUSE_R, layoutBulbs, rimPoint, yawToward, type Plate } from '../../src/engine/layout/layoutBulbs.ts';
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
    expect(street.r).toBeCloseTo(HOUSE_R / f((8 * 360) / 200), 9); // arc-confined: n_eff = n · 360 / 200
    const root = l.plates.get(l.root!)!;
    expect(root.r).toBeCloseTo(street.r / f(6), 9);
    for (const p of plates) {
      if (p.parent === null) continue;
      const parent = l.plates.get(p.parent)!;
      expect(Math.hypot(p.cx - parent.cx, p.cz - parent.cz)).toBeCloseTo(parent.r + 0.6 * p.r, 9);
      const at = attachPoint(p, parent);
      expect(Math.hypot(at.x - parent.cx, at.z - parent.cz)).toBeCloseTo(parent.r, 9);
    }
  });

  test("grandchildren bud within ±100° of their parent's outward direction; siblings never overlap", () => {
    const l = layoutBulbs(city(6, 8));
    const plates = [...l.plates.values()];
    for (const h of plates.filter((p) => p.stage === 'House')) {
      const s = l.plates.get(h.parent!)!;
      expect(Math.abs(wrap(angleFrom(h, s) - s.theta))).toBeLessThanOrEqual(ARC + 1e-9);
    }
    const byParent = new Map<number, Plate[]>();
    for (const p of plates) if (p.parent !== null) byParent.set(p.parent, [...(byParent.get(p.parent) ?? []), p]);
    for (const kids of byParent.values()) {
      for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
        const [a, b] = [kids[i], kids[j]];
        expect(Math.hypot(a.cx - b.cx, a.cz - b.cz), `${a.id}/${b.id}`).toBeGreaterThanOrEqual(0.9 * (a.r + b.r));
      }
    }
  });

  test('satellites sit in the arc gaps of a city rim, foundry and yard alternating; a house run has none', () => {
    const l = layoutBulbs(city(6, 8));
    expect(l.satellites).toHaveLength(6);
    expect(l.satellites.map((s) => s.kind)).toEqual(['foundry', 'yard', 'foundry', 'yard', 'foundry', 'yard']);
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
