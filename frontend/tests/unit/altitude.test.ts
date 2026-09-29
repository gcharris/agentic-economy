// ARCHITECTURE §10: the hysteresis sequence and the pending clamp.

import { expect, test } from 'vitest';
import { AltitudeRig } from '../../src/scene/camera/AltitudeRig.ts';
import type { Frame } from '../../src/engine/source/EngineSource.ts';
import { Store } from '../../src/engine/store/Store.ts';

test('2.55, 2.62, 2.58, 2.41, 2.38 produces exactly two zoom calls, 3 then 2', () => {
  const rig = new AltitudeRig();
  const calls: number[] = [];
  rig.jumpTo(2.0); // band 1 → 2 on the way up
  rig.onZoom = (b) => calls.push(b);
  for (const a of [2.55, 2.62, 2.58, 2.41, 2.38]) rig.jumpTo(a);
  expect(calls).toEqual([3, 2]);
});

test('the pending clamp holds the drawn altitude at the band edge until a confirming TICK_COMMITTED', () => {
  const rig = new AltitudeRig();
  rig.jumpTo(2.0);
  rig.pending = null;
  rig.jumpTo(2.9);
  expect(rig.band).toBe(3);
  expect(rig.visualA).toBe(2.5);
  const frame = (scale: 'Street' | 'City', tick: number) => ({
    tick, arrivedAt: 0, decisions: [],
    state: { active_scale: scale } as Frame['state'],
    events: [{ type: 'TICK_COMMITTED', tick, active_scale: scale } as unknown as Frame['events'][number]],
  }) as Frame;
  rig.follow(new Store(), frame('Street', 5));
  expect(rig.visualA).toBe(2.5);
  rig.follow(new Store(), frame('City', 6));
  expect(rig.pending).toBeNull();
  expect(rig.visualA).toBe(2.9);
});
