// The street band against the recorded street run, headless: cottages on the ring, the four-beat handshake,
// the hash-mismatch snap-back; and the courier timeline itself.

import * as THREE from 'three';
import { expect, test } from 'vitest';
import { App } from '../../src/app/App.ts';
import { NullRenderer } from '../../src/app/Renderer.ts';
import { TraceSource } from '../../src/engine/source/TraceSource.ts';
import { NOOP_UI } from '../../src/engine/store/Store.ts';
import { BEAT_EDGES, CARRY, courierAt, SNAP, type Run } from '../../src/scene/street/couriers.ts';
import { StreetBand } from '../../src/scene/street/StreetBand.ts';
import { loadTrace } from '../helpers/assets.ts';

const run = (): Run => ({ envelope: 1, from: 1, to: 2, start: new THREE.Vector3(0, 0, 0), meet: new THREE.Vector3(1, 0, 0), t0: 10, outcome: null });

test('a courier walks 900 ms, waits, then plays lock, swap, verify, settle', () => {
  const r = run();
  expect(courierAt(r, 10.45).beat).toBe('walk');
  expect(courierAt(r, 10 + CARRY + 0.1).beat).toBe('wait');
  r.outcome = { kind: 'settled', t0: 10, amount: 10 };
  const b0 = 10 + CARRY;
  expect(courierAt(r, b0 + 0.1).beat).toBe('lock');
  expect(courierAt(r, b0 + 0.3).beat).toBe('swap');
  expect(courierAt(r, b0 + 0.5).beat).toBe('verify');
  expect(courierAt(r, b0 + 0.7).beat).toBe('settle');
  expect(courierAt(r, b0 + BEAT_EDGES.settle + 0.01).beat).toBe('done');
});

test('a hash mismatch snaps the courier back to its slot in 300 ms', () => {
  const r = run();
  r.outcome = { kind: 'snapback', t0: 10.5 };
  expect(courierAt(r, 10.5 + SNAP / 2).beat).toBe('snap');
  const end = courierAt(r, 10.5 + SNAP - 1e-6).pos;
  expect(end.distanceTo(r.start)).toBeLessThan(0.02);
  expect(courierAt(r, 10.5 + SNAP + 0.01).visible).toBe(false);
});

test('the recorded street: six cottages on ring 1, settles at the kerb, snap-backs from tick 7', async () => {
  const street = new StreetBand();
  let now = 50;
  const app = await App.boot({ source: TraceSource.fromTrace(loadTrace(), 'street'), renderer: new NullRenderer(), ui: NOOP_UI, clock: 'manual', bands: [street], now: () => now });
  await app.stepTo(1);
  app.renderFrame(now);
  expect(street.cottages.size).toBe(6);
  expect(app.rig.band).toBe(2); // a recorded run opens at its scale
  let settled = 0, snapped = 0;
  for (let t = 2; t <= 9; t++) {
    now += 0.7;
    const f = (await app.stepTo(t))!;
    settled += f.events.filter((e) => e.type === 'SETTLED').length;
    for (let k = 0; k < 10; k++) { now += 0.1; app.renderFrame(now); }
    snapped += [...street.runs.values()].filter((r) => r.outcome?.kind === 'snapback').length;
  }
  expect(settled).toBeGreaterThan(0);
  expect(snapped).toBeGreaterThan(0);
  expect(street.group.visible).toBe(true);
  app.dispose();
});
