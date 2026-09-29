// The world (Stage 5) against the real wasm, headless: world_full(3, 2, 3, 4) at the World for the globe and the
// STARK heartbeat at tick 16; scenario 5 (world) for finality orbits; a partition fed through the band's event seam.

import { expect, test } from 'vitest';
import { App } from '../../src/app/App.ts';
import { NullRenderer } from '../../src/app/Renderer.ts';
import { NOOP_UI } from '../../src/engine/store/Store.ts';
import { layoutBulbs } from '../../src/engine/layout/layoutBulbs.ts';
import { globeWeight } from '../../src/scene/camera/Dissolve.ts';
import { GLOBE_R, globeFrame, LATITUDE } from '../../src/scene/atlas/globe.ts';
import { WorldBand } from '../../src/scene/atlas/WorldBand.ts';
import { CountryBand } from '../../src/scene/atlas/CountryBand.ts';
import { CityBand } from '../../src/scene/city/CityBand.ts';
import { engineSource } from '../helpers/engineSource.ts';

test('several roots: each country lays out its own tree, apart on the ground', () => {
  const nodes = [
    { id: 1, parent: null, stage: 'Country' as const }, { id: 2, parent: 1, stage: 'City' as const },
    { id: 3, parent: null, stage: 'Country' as const }, { id: 4, parent: 3, stage: 'City' as const },
  ];
  const l = layoutBulbs(nodes);
  expect(l.trees.map((t) => t.id)).toEqual([1, 3]);
  expect(l.plates.get(1)!.cx).toBe(0);
  const [a, b] = l.trees;
  expect(b.cx - a.cx).toBeGreaterThanOrEqual(6 * (a.extent + b.extent) - 1e-9);
  expect(Math.hypot(l.plates.get(4)!.cx - b.cx, l.plates.get(4)!.cz)).toBeLessThan(b.extent);
  // The globe: beacons on the 30° N circle, the focused one standing where its relief stood.
  const g = globeFrame(l, 3)!;
  for (const x of g.beacons) {
    expect(x.pos.distanceTo(g.centre)).toBeCloseTo(GLOBE_R, 6);
    expect(Math.asin(x.normal.dot(g.pole))).toBeCloseTo(LATITUDE, 6);
  }
  const f = g.beacons.find((x) => x.id === 3)!;
  expect(f.pos.x).toBeCloseTo(b.cx, 6);
  expect(f.pos.z).toBeCloseTo(0, 6);
});

test('world_full(3, 2, 3, 4) at the World: cities live, the heartbeat lands at tick 16 and sweeps the globe', async () => {
  const world = new WorldBand();
  let now = 50;
  const app = await App.boot({
    source: engineSource('world', { world: { countries: 3, cities: 2, streets: 3, houses: 4 } }), renderer: new NullRenderer(), ui: NOOP_UI, clock: 'manual',
    bands: [new CityBand(), new CountryBand(), world], now: () => now,
  });
  await app.command({ decision: 'zoom', stage: 5 });
  const f1 = (await app.stepTo(1))!;
  expect(f1.state.active_scale).toBe('World');
  const nodes = f1.state.nodes;
  expect(nodes.filter((n) => n.stage === 'Country')).toHaveLength(3);
  expect(nodes.filter((n) => n.stage === 'House').every((n) => n.status === 'packed')).toBe(true);
  expect(nodes.filter((n) => n.stage === 'Street').every((n) => n.status === 'packed' && n.packed !== null)).toBe(true);
  expect(nodes.filter((n) => n.stage === 'City').every((n) => n.status !== 'packed')).toBe(true);
  expect(app.rig.band).toBe(5);
  app.renderFrame(now); // a render frame at band 5 sets the World's tick seconds (0.25 s)
  expect(app.store.tickSeconds).toBe(0.25);
  expect(world.frame?.beacons).toHaveLength(3);
  expect(world.beacons).toHaveLength(3);
  expect(world.fibres).toHaveLength(3); // every pair of three

  let beat: { tick: number; latency: number } | null = null;
  for (let t = 2; t <= 16; t++) {
    now += 0.25;
    const f = (await app.stepTo(t))!;
    const ev = f.events.find((e) => e.type === 'GLOBAL_STATE_CONFIRMED');
    if (ev && ev.type === 'GLOBAL_STATE_CONFIRMED') beat = { tick: ev.tick, latency: ev.latency_ticks };
  }
  expect(beat?.tick).toBe(16);
  expect(beat!.latency).toBeGreaterThanOrEqual(8);
  expect(beat!.latency).toBeLessThanOrEqual(32);
  const h = world.heartbeat!;
  expect(h.tick).toBe(16);
  expect(h.duration).toBeCloseTo(beat!.latency * 0.25, 6); // latency_ticks × the World's tick seconds
  expect(world.sweepAt(h.t0 + h.duration / 2)).toBeCloseTo(0.5, 6);
  expect(world.sweepAt(h.t0 + h.duration + 0.1)).toBeNull();
  // Mid-sweep in orbit: the globe drawn, the flat world hidden, the meridian a quarter turn round at k = 0.25.
  app.rig.setBand(5, true);
  app.renderFrame(h.t0 + h.duration / 4);
  expect(globeWeight(app.rig.visualA)).toBe(1);
  expect(world.group.visible).toBe(true);
  expect(app.tiles.group.visible).toBe(false);
  expect(world.meridian!.visible).toBe(true);
  expect(world.meridian!.rotation.y).toBeCloseTo(Math.PI / 2, 6);
  expect(world.fibres.every((x) => x.core.visible)).toBe(true);
  expect(world.partitioned.size).toBe(0);
  app.renderFrame(h.t0 + h.duration + 0.1);
  expect(world.meridian!.visible).toBe(false);

  // A partition (fed through the band's seam): the country goes dark, its fibre cores off, until a heartbeat omits it.
  const dark = world.beacons[1].id;
  world.onEvent({ ev: { type: 'GLOBAL_STATE_CONFIRMED', tick: 32, root: '0'.repeat(64), latency_ticks: 8, partitioned: [dark] }, arrivedAt: now, seeked: false, clip: null } as never);
  expect(world.beacons[1].halo.visible).toBe(false);
  expect(world.beacons[1].lantern.emissiveIntensity).toBe(0);
  expect(world.fibres.filter((x) => x.a === dark || x.b === dark).every((x) => !x.core.visible)).toBe(true);
  expect(world.fibres.filter((x) => x.a !== dark && x.b !== dark).every((x) => x.core.visible)).toBe(true);
  world.onEvent({ ev: { type: 'GLOBAL_STATE_CONFIRMED', tick: 48, root: '0'.repeat(64), latency_ticks: 8, partitioned: [] }, arrivedAt: now, seeked: false, clip: null } as never);
  expect(world.beacons[1].halo.visible).toBe(true);
  expect(world.fibres.every((x) => x.core.visible)).toBe(true);
  app.dispose();
});

test('scenario 5: an envelope awaiting finality orbits its country beacon until until_tick', async () => {
  const world = new WorldBand();
  let now = 10;
  const app = await App.boot({ source: engineSource('world'), renderer: new NullRenderer(), ui: NOOP_UI, clock: 'manual', bands: [world], now: () => now });
  let orbiting = 0, until = 0, seen = 0;
  for (let t = 1; t <= 12 && !orbiting; t++) {
    now += 0.25;
    const f = (await app.stepTo(t))!;
    const ev = f.events.find((e) => e.type === 'AWAITING_FINALITY');
    if (ev && ev.type === 'AWAITING_FINALITY') { until = ev.until_tick; seen = f.tick; }
    orbiting = world.orbits.size;
  }
  expect(orbiting).toBeGreaterThan(0);
  const o = [...world.orbits.values()][0];
  expect(world.frame!.beacons.some((b) => b.id === o.country)).toBe(true);
  expect(o.until).toBeGreaterThan(seen);
  app.rig.setBand(5, true);
  app.renderFrame(now + 0.5);
  const b = world.frame!.beacons.find((x) => x.id === o.country)!;
  expect(o.card.visible).toBe(true);
  expect(o.card.position.distanceTo(world.frame!.centre)).toBeCloseTo(GLOBE_R + 150, 3); // at R + 150
  expect(o.card.position.distanceTo(b.pos)).toBeLessThan(1500);
  void until;
  app.dispose();
});
