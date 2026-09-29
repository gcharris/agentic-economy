// Boot from the URL (ARCHITECTURE §9.4). ?source=wasm|sse|trace, &run=…, &seed, &budget, &tasks, &cost,
// &zoom=1 (a zoom/<n> before tick 1), &quality, &lighting, &motion=reduced, &take=thumbnail, &clock=manual
// (exposes window.__app = { ready, stepTo, step, frame } for tests), &stats=1.

import './styles/tokens.css';
import './styles/hud.css';
import './styles/door.css';
import './styles/note.css';
import { Vector3 } from 'three';
import { App } from './app/App.ts';
import { ThreeRenderer } from './app/ThreeRenderer.ts';
import { LIGHTING_PRESETS } from './app/lighting.ts';
import type { EngineSource } from './engine/source/EngineSource.ts';
import { SseSource } from './engine/source/SseSource.ts';
import { RUN_NAMES, TraceSource, type RunName, type Trace } from './engine/source/TraceSource.ts';
import { WasmSource } from './engine/source/WasmSource.ts';
import type { LightingPreset, QualityPreset } from './engine/store/bus.ts';
import { bindAltitudeInput } from './scene/camera/input.ts';
import { RoomBand } from './scene/room/RoomBand.ts';
import { StreetBand } from './scene/street/StreetBand.ts';
import { CityBand } from './scene/city/CityBand.ts';

const TAKES = {
  /** DESIGN §11: H = 7 m at 1080 rows (154 px/m), framing the Oak Table's east end to the step. */
  thumbnail: { ppm: 154, target: [3.5, 0.8, 0.3] as [number, number, number] },
};

async function makeSource(q: URLSearchParams): Promise<EngineSource> {
  const run = (q.get('run') ?? 'house') as RunName;
  const kind = q.get('source') ?? 'trace';
  if (kind === 'sse') return new SseSource();
  if (kind === 'wasm') {
    const scenario = run.startsWith('house') ? 'house' : run === 'street_doors' ? 'street' : (run as 'street' | 'city' | 'world');
    return new WasmSource({
      scenario, seed: q.get('seed') ?? 7, budget: Number(q.get('budget') ?? 800), tasks: Number(q.get('tasks') ?? 15),
      costVisible: q.get('cost') !== '0' && run !== 'house_hidden_cost',
    });
  }
  const trace = (await (await fetch(`${import.meta.env.BASE_URL}traces/trace.json`)).json()) as Trace;
  return TraceSource.fromTrace(trace, RUN_NAMES.includes(run) ? run : 'house');
}

async function main(): Promise<void> {
  const q = new URLSearchParams(location.search);
  const quality = (['low', 'balanced', 'high'].includes(q.get('quality') ?? '') ? q.get('quality') : 'balanced') as QualityPreset;
  // No ?lighting=: DESIGN §2b picks per band (Golden in the room, Noon outdoors).
  const preset = LIGHTING_PRESETS.includes(q.get('lighting') as LightingPreset) ? (q.get('lighting') as LightingPreset) : null;
  const reducedMotion = q.get('motion') === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const manual = q.get('clock') === 'manual';
  document.body.dataset.quality = quality;
  const source = await makeSource(q);
  const renderer = new ThreeRenderer(document.querySelector<HTMLCanvasElement>('#stage')!, quality, q.get('stats') === '1');
  const app = await App.boot({
    source, renderer, root: document, clock: manual ? 'manual' : 'auto', quality, reducedMotion,
    lighting: preset ? { preset, blend: 0, cycle: false } : undefined, bands: [new RoomBand(), new StreetBand(), new CityBand()],
  });
  if (source.live) bindAltitudeInput(renderer.gl.domElement, app.rig);
  const take = q.get('take');
  if (take && take in TAKES) {
    app.rig.setTake(TAKES[take as keyof typeof TAKES]);
    document.body.dataset.take = take; // a director take shows the Door card and nothing else of the HUD
  }
  const zoom = Number(q.get('zoom'));
  if (zoom >= 1 && zoom <= 5 && source.live) await app.command({ decision: 'zoom', stage: zoom as 1 | 2 | 3 | 4 | 5 });
  if (manual) {
    // Tests: step explicitly, then render one frame so a screenshot shows the tick asked for.
    const render = () => { app.renderFrame(); return app.frame()?.tick ?? 0; };
    (window as unknown as { __app: unknown }).__app = {
      ready: true,
      stepTo: async (t: number) => { await app.stepTo(t); return render(); },
      step: async () => { await app.step(); return render(); },
      frame: () => app.frame(),
      render: (at?: number) => { app.renderFrame(at); return true; },
      /** Where a point in the focused house's local metres projects on screen. */
      locatePoint: (x: number, y: number, z: number) => {
        const w = new Vector3(x, y, z).applyAxisAngle(new Vector3(0, 1, 0), app.rig.frameYaw).add(app.rig.origin);
        const p = app.project(w);
        return { x: Math.round(p.x), y: Math.round(p.y), visible: p.visible };
      },
      /** Where a named scene object (a seat's cat, 'room-fixtures') projects on screen, for GPU tests. */
      locate: (name: string) => {
        const o = renderer.scene.getObjectByName(name);
        if (!o) return null;
        const p = app.project(o.getWorldPosition(new Vector3()).add(new Vector3(0, 0.5, 0)));
        return { x: Math.round(p.x), y: Math.round(p.y), visible: p.visible && o.visible };
      },
    };
    render();
  } else {
    await app.step();
    app.clock?.start();
  }
}

void main();
