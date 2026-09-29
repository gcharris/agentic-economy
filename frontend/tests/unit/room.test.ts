// The room band against the recorded house run, headless: stations, the Porter at the Door, the proof lamps.

import { expect, test } from 'vitest';
import { App } from '../../src/app/App.ts';
import { NullRenderer } from '../../src/app/Renderer.ts';
import { TraceSource } from '../../src/engine/source/TraceSource.ts';
import { NOOP_UI } from '../../src/engine/store/Store.ts';
import { RoomBand } from '../../src/scene/room/RoomBand.ts';
import { PORTER_AT_DOOR, STATIONS } from '../../src/scene/room/stations.ts';
import { loadTrace } from '../helpers/assets.ts';

async function bootRoom() {
  const room = new RoomBand();
  let now = 100;
  const app = await App.boot({ source: TraceSource.fromTrace(loadTrace(), 'house'), renderer: new NullRenderer(), ui: NOOP_UI, clock: 'manual', bands: [room], now: () => now });
  return { app, room, advance: (dt: number) => { now += dt; app.renderFrame(now); } };
}

test('while waiting at the Door every cat is still at its station and the Porter stands at the step, envelope out', async () => {
  const { app, room, advance } = await bootRoom();
  await app.stepTo(4);
  advance(2);
  expect(room.status).toBe('waiting_at_door');
  expect(room.fx.doorPivot.rotation.y).toBe(0); // the leaf stays closed, frame lit, until APPROVED
  const porter = room.actors.get('Porter')!;
  expect(porter.cat.position.x).toBeCloseTo(PORTER_AT_DOOR.x, 5);
  expect(porter.cat.position.z).toBeCloseTo(PORTER_AT_DOOR.z, 5);
  expect(porter.envelope!.visible).toBe(true);
  for (const s of ['Scout', 'Scribble', 'Inspector', 'Penny'] as const) {
    const c = room.actors.get(s)!.cat;
    expect([c.position.x, c.position.z]).toEqual([STATIONS[s].x, STATIONS[s].z]);
    const y = c.position.y;
    advance(0.37);
    expect(c.position.y).toBe(y); // frozen: no bob
  }
  // L2 and L3 lit from state: someone is being asked.
  expect(room.fx.deskShade.emissiveIntensity).toBeGreaterThan(1);
  expect(room.fx.doorFrame.emissiveIntensity).toBeGreaterThan(0.8);
  // The haze has tweened to the frame's Φ.
  const phi = app.store.node(app.store.focus!)!.confidence;
  expect(room.fx.haze.phiAt(1e9)).toBeCloseTo(phi, 6);
});

test('APPROVED at tick 5 swings the Door open and walks the Porter out; the lamps come down', async () => {
  const { app, room, advance } = await bootRoom();
  await app.stepTo(5);
  advance(0.3);
  expect(room.fx.doorPivot.rotation.y).toBeGreaterThan(1.0); // most of 70°
  expect(room.actors.get('Porter')!.cat.position.x).toBeGreaterThan(PORTER_AT_DOOR.x);
  advance(3);
  expect(room.fx.doorPivot.rotation.y).toBe(0);
  expect(room.fx.deskShade.emissiveIntensity).toBe(0);
  expect(room.status).toBe('active');
});
