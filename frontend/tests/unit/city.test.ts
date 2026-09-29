// The city against scenario 3 in the real wasm, headless: one tile mesh for every cell, the Clearinghouse, a tube
// per street, and the NETTED pulse's beats (fill, flare, ring, sage ticks) from one event.

import { expect, test } from 'vitest';
import { App } from '../../src/app/App.ts';
import { NullRenderer } from '../../src/app/Renderer.ts';
import { NOOP_UI } from '../../src/engine/store/Store.ts';
import { PULSE_KIND } from '../../src/engine/store/clips.ts';
import { CityBand } from '../../src/scene/city/CityBand.ts';
import { engineSource } from '../helpers/engineSource.ts';

test('scenario 3: the city opens at band 3 without a zoom call, and NETTED plays its four beats', async () => {
  const city = new CityBand();
  let now = 10;
  const source = engineSource('city');
  const zooms: number[] = [];
  source.zoom = async (s) => { zooms.push(s); return true; };
  const app = await App.boot({ source, renderer: new NullRenderer(), ui: NOOP_UI, clock: 'manual', bands: [city], now: () => now });
  const f = (await app.stepTo(1))!;
  expect(f.state.active_scale).toBe('City');
  app.renderFrame(now);
  expect(app.rig.band).toBe(3);
  expect(zooms).toEqual([]); // zoom/3 would pack the houses
  expect(city.group.visible).toBe(true);

  const layout = app.store.layout.current;
  const tiles = app.tiles.tiles;
  expect(tiles.filter((t) => t.kind === 3)).toHaveLength(1);           // the city plate: the Clearinghouse at its centre
  expect(tiles.filter((t) => t.kind === 2)).toHaveLength(2);           // two street plates
  expect(tiles.filter((t) => t.kind === 1)).toHaveLength(6);           // six house plates
  expect(tiles.length).toBe(1 + 2 + 6);                                 // foundries and yards are buildings on the plate
  expect(app.tiles.mesh!.count).toBe(tiles.length);                    // one InstancedMesh, one draw (plus the specks)
  expect(city.tubes).toHaveLength(2);
  expect(tiles.filter((t) => t.kind <= 3).every((t) => t.slot >= 0)).toBe(true);

  const net = f.events.find((e) => e.type === 'NETTED');
  expect(net).toMatchObject({ gross: 60, net: 20, envelopes: 12 });
  expect(app.store.pulses.entries.some((p) => p?.kind === PULSE_KIND.NETTED)).toBe(true);
  expect(app.uniforms.uPulses.value.some((v) => v.x === PULSE_KIND.NETTED)).toBe(true);

  const t0 = city.netted!.t0;
  app.renderFrame(t0 + 0.2);                                            // beat 1: the tubes fill inward
  expect(city.tubes.every((t) => t.fill.visible && t.fill.scale.z > 0)).toBe(true);
  expect(city.tubes[0].fill.scale.x).toBeCloseTo(0.3, 6);               // clamp(60 / 200, 0.2, 1.0)
  app.renderFrame(t0 + 0.4);                                            // beat 2: the dome flares
  expect(city.hall!.dome.emissiveIntensity).toBeGreaterThan(0.8);
  app.renderFrame(t0 + 2.0);
  expect(city.hall!.dome.emissiveIntensity).toBe(0);
  app.dispose();
});

test('engine_new_city: 6 streets x 8 houses, laid out as bulbs with every house on its street\'s rim', async () => {
  const source = engineSource('city', { city: { streets: 6, houses: 8 } });
  const app = await App.boot({ source, renderer: new NullRenderer(), ui: NOOP_UI, clock: 'manual', bands: [new CityBand()] });
  const f = (await app.stepTo(1))!;
  const count = (st: string) => f.state.nodes.filter((n) => n.stage === st).length;
  expect([count('City'), count('Street'), count('House')]).toEqual([1, 6, 48]);
  expect(app.tiles.tiles.filter((t) => t.kind === 1)).toHaveLength(48);
  expect(app.store.layout.current.satellites).toHaveLength(6);
  app.dispose();
});

test('pack_depth 3: the houses stay live at the City; at the Country a street seals (resin, no commons, a stasis plate)', async () => {
  const { StreetBand } = await import('../../src/scene/street/StreetBand.ts');
  const source = engineSource('city');
  const street = new StreetBand();
  const labels: string[] = [];
  const app = await App.boot({ source, renderer: new NullRenderer(), ui: NOOP_UI, clock: 'manual', bands: [new CityBand(), street] });
  app.store.bus.on('label', (l) => { if (!('remove' in l) && l.kind === 'plate') labels.push(l.text); });
  let f = (await app.stepTo(1))!;
  expect(f.state.nodes.filter((n) => n.status === 'packed')).toHaveLength(0);          // live at the City
  await source.zoom(4);
  f = (await app.step())!;
  const streets = f.state.nodes.filter((n) => n.stage === 'Street');
  expect(streets.every((n) => n.packed !== null)).toBe(true);
  expect(f.state.nodes.filter((n) => n.stage === 'House').every((n) => n.status === 'packed')).toBe(true);
  const iB = app.tiles.mesh!.geometry.getAttribute('iB').array as Float32Array;
  app.tiles.tiles.forEach((t, i) => { if (t.kind === 2) expect(iB[i * 4 + 3]).toBeGreaterThanOrEqual(2); }); // sealed
  expect(labels.some((l) => /^3 in stasis · \d+ ticks$/.test(l))).toBe(true);
  street.setAltitude(2);
  expect([...street.cottages.values()].every((c) => !c.group.visible)).toBe(true);
  app.dispose();
});
