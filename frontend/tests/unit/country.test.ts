// The country (Stage 4) against the real wasm, headless: scenario 4 (forged_country) for the court's beats, and
// engine_new_world for the whole tree at the Country.

import { expect, test } from 'vitest';
import { App } from '../../src/app/App.ts';
import { NullRenderer } from '../../src/app/Renderer.ts';
import { NOOP_UI } from '../../src/engine/store/Store.ts';
import { PULSE_KIND } from '../../src/engine/store/clips.ts';
import { CountryBand, UNWIND } from '../../src/scene/atlas/CountryBand.ts';
import { CityBand } from '../../src/scene/city/CityBand.ts';
import { engineSource } from '../helpers/engineSource.ts';

test('scenario 4: city plates bud from the country rim; ROLLED_BACK unwinds; SLASHED flashes and scorches', async () => {
  const country = new CountryBand();
  let now = 20;
  const app = await App.boot({ source: engineSource('country'), renderer: new NullRenderer(), ui: NOOP_UI, clock: 'manual', bands: [new CityBand(), country], now: () => now });
  await app.stepTo(1);
  const layout = app.store.layout.current;
  const root = layout.plates.get(layout.root!)!;
  expect(root.stage).toBe('Country');
  const cities = [...layout.plates.values()].filter((p) => p.stage === 'City');
  expect(cities).toHaveLength(7);
  for (const c of cities) { expect(c.parent).toBe(root.id); expect(c.base).toBeCloseTo(root.top, 9); expect(c.top).toBeGreaterThan(root.top); }
  expect(country.country?.id).toBe(root.id);

  now += 1;
  const f = (await app.stepTo(2))!;
  const types = f.events.map((e) => e.type);
  expect(types).toContain('ROLLED_BACK');
  expect(types).toContain('VOIDED');
  expect(types.filter((t) => t === 'SLASHED').length).toBeGreaterThan(0);
  const t0 = country.rollback!.t0;
  expect(country.unwindAt(t0 + UNWIND / 2)).toBeCloseTo(0.5, 6);
  expect(country.unwindAt(t0 + UNWIND + 0.1)).toBe(0);
  app.rig.setBand(4, true);
  app.renderFrame(t0 + UNWIND / 2);
  expect(country.group.visible).toBe(true);
  // SLASHED: a pulse per slashed city, origin at its plate centre (the shader flashes the rim and scorches the plate).
  const slashed = app.store.pulses.entries.filter((p) => p?.kind === PULSE_KIND.SLASHED);
  expect(slashed.length).toBeGreaterThan(0);
  const at = slashed[0]!.origin;
  expect(cities.some((c) => Math.hypot(c.cx - at.x, c.cz - at.z) < 1e-6)).toBe(true);
  app.dispose();
});

test('engine_new_world(1, 3, 2, 3) at the Country: the houses packed, every street sealed, a Clearinghouse per city', async () => {
  const app = await App.boot({ source: engineSource('country', { world: { countries: 1, cities: 3, streets: 2, houses: 3 } }), renderer: new NullRenderer(), ui: NOOP_UI, clock: 'manual', bands: [new CityBand(), new CountryBand()] });
  const f = (await app.stepTo(1))!;
  expect(f.state.active_scale).toBe('Country');
  expect(f.state.nodes.filter((n) => n.stage === 'House').every((n) => n.status === 'packed')).toBe(true);
  expect(f.state.nodes.filter((n) => n.stage === 'Street').every((n) => n.packed !== null)).toBe(true);
  expect(app.rig.band).toBe(4);
  const iB = app.tiles.mesh!.geometry.getAttribute('iB').array as Float32Array;
  app.tiles.tiles.forEach((t, i) => { if (t.kind === 2) expect(iB[i * 4 + 3]).toBeGreaterThanOrEqual(2); });
  const city = app.bands.find((b) => b instanceof CityBand) as CityBand;
  expect(city.halls).toHaveLength(3);
  app.dispose();
});
