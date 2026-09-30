// Boot from the URL (ARCHITECTURE §9.4). ?source=wasm|sse|trace, &run=…, &seed, &budget, &tasks, &cost,
// &zoom=1 (a zoom/<n> before tick 1), &quality, &lighting, &motion=reduced, &take=thumbnail, &clock=manual
// (exposes window.__app = { ready, stepTo, step, frame } for tests), &stats=1.

import './styles/tokens.css';
import './styles/hud.css';
import './styles/door.css';
import './styles/note.css';
import './styles/game.css';
import { Vector3 } from 'three';
import { App } from './app/App.ts';
import { ThreeRenderer } from './app/ThreeRenderer.ts';
import { LIGHTING_PRESETS } from './app/lighting.ts';
import type { EngineSource } from './engine/source/EngineSource.ts';
import { SseSource } from './engine/source/SseSource.ts';
import { RUN_NAMES, TraceSource, type RunName, type Trace } from './engine/source/TraceSource.ts';
import { WasmSource } from './engine/source/WasmSource.ts';
import type { LightingPreset, QualityPreset } from './engine/store/bus.ts';
import type { UiLayer } from './engine/store/Store.ts';
import { bindAltitudeInput } from './scene/camera/input.ts';
import { RoomBand } from './scene/room/RoomBand.ts';
import { StreetBand } from './scene/street/StreetBand.ts';
import { CityBand } from './scene/city/CityBand.ts';
import { CountryBand } from './scene/atlas/CountryBand.ts';
import { WorldBand } from './scene/atlas/WorldBand.ts';
import { NameTags } from './scene/street/NameTags.ts';
import { NullRenderer } from './app/Renderer.ts';
import { PhoneView } from './ui/phone.ts';
import { NotesTable } from './ui/notes.ts';
import { Hud } from './ui/hud.ts';

const TAKES = {
  /** DESIGN §11: H = 7 m at 1080 rows (154 px/m), framing the Oak Table's east end to the step. */
  thumbnail: { ppm: 154, target: [3.5, 0.8, 0.3] as [number, number, number] },
  /** The zoom take: the rig's own framing at every altitude, no HUD, no card. */
  zoom: null,
  /** The Door take: the room at 64 px/m, 2 m left of the rig's framing so the Door card stands right of the Door and the
   *  room, the Porter and the step stay in view; the HUD and the card both shown. */
  door: { ppm: 64, target: [2.0, 0.8, 0.8] as [number, number, number] },
};

async function makeSource(q: URLSearchParams): Promise<EngineSource> {
  const run = (q.get('run') ?? 'house') as RunName;
  const kind = q.get('source') ?? 'trace';
  // The engine is `serve` on the machine that served this page, port 8787 (a phone on the household wifi reaches the
  // laptop, not itself); &engine=http://host:port overrides.
  if (kind === 'sse') return new SseSource({ baseUrl: q.get('engine') ?? `${location.protocol}//${location.hostname}:8787` });
  if (kind === 'wasm') {
    // &run=game: A Week on Elm Street (doc 06) through engine_new_game: &houses=4&week=40, the price walk (&walk=0 off),
    // only the person asks the oracle (&oracle=staff for the demo's Scout).
    if (run === ('game' as RunName)) {
      return new WasmSource({
        scenario: 'street', seed: q.get('seed') ?? 7, budget: Number(q.get('budget') ?? 800), tasks: Number(q.get('tasks') ?? 15), costVisible: true,
        game: { houses: Number(q.get('houses') ?? 4), week: Number(q.get('week') ?? 40), priceWalk: q.get('walk') !== '0', oraclePerson: q.get('oracle') !== 'staff', oracleCost: Number(q.get('oracle-cost') ?? 15), cadence: Number(q.get('cadence') ?? 8), sendTicks: Number(q.get('send-ticks') ?? 1) },
      });
    }
    const scenario = run.startsWith('house') ? 'house' : run === 'street_doors' ? 'street' : run === ('world_full' as RunName) || run === ('country' as RunName) ? 'country' : (run as 'street' | 'city' | 'world');
    return new WasmSource({
      scenario, seed: q.get('seed') ?? 7, budget: Number(q.get('budget') ?? 800), tasks: Number(q.get('tasks') ?? 15),
      costVisible: q.get('cost') !== '0' && run !== 'house_hidden_cost',
      // &streets=6&houses=8: a sized city through engine_new_city (DESIGN §2c.5).
      // &run=world_full&countries=1&cities=3&streets=6&houses=8: the whole tree through engine_new_world (Stage 4).
      ...(run === ('world_full' as RunName) ? { world: { countries: Number(q.get('countries') ?? 1), cities: Number(q.get('cities') ?? 3), streets: Number(q.get('streets') ?? 6), houses: Number(q.get('houses') ?? 8) } } : {}),
      ...(run !== ('world_full' as RunName) && (q.get('streets') || q.get('houses')) ? { city: { streets: Number(q.get('streets') ?? 2), houses: Number(q.get('houses') ?? 3) } } : {}),
    });
  }
  const trace = (await (await fetch(`${import.meta.env.BASE_URL}traces/trace.json`)).json()) as Trace;
  return TraceSource.fromTrace(trace, RUN_NAMES.includes(run) ? run : 'house');
}

/** The TV's DOM: the block line and the ticker from the HUD (the Doors are on the phones), and Friday's Notes. */
function tvUi(source: EngineSource): UiLayer {
  const hud = new Hud({ root: document, source, zoom: () => undefined });
  const notes = new NotesTable(document);
  return { apply(frame, store) { hud.apply(frame, store); notes.apply(frame.state); } };
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
  // A Week on Elm Street (doc 06 §5): ?house=<name or n> is a phone (one Door, no canvas); ?view=tv is the street on
  // the TV, the cottages named, the Notes on the table on Friday.
  const house = q.get('house');
  const tv = q.get('view') === 'tv';
  if (house) document.body.dataset.view = 'phone';
  else if (tv) document.body.dataset.view = 'tv';
  const renderer = house ? new NullRenderer() : new ThreeRenderer(document.querySelector<HTMLCanvasElement>('#stage')!, quality, q.get('stats') === '1');
  // Manual clock: a virtual app clock that render(at) advances, so a take drawn at 1/24 s per frame (however long each
  // frame takes to draw) keeps frames, clips and folds on one timeline.
  let clockT = performance.now() / 1000;
  const app = await App.boot({
    source, renderer, root: document, clock: manual ? 'manual' : 'auto', quality, reducedMotion, now: manual ? () => clockT : undefined,
    lighting: preset ? { preset, blend: 0, cycle: false } : undefined,
    bands: house ? [] : tv ? [new StreetBand(), new NameTags()] : [new RoomBand(), new StreetBand(), new CityBand(), new CountryBand(), new WorldBand()],
    ...(house ? { ui: (a: App) => new PhoneView(document, house, a.command.bind(a), source.live) } : {}),
    ...(tv ? { ui: () => tvUi(source) } : {}),
  });
  if (tv) app.rig.hold(2);
  if (source.live && renderer.gl && !house && !tv) bindAltitudeInput(renderer.gl.domElement, app.rig);
  const take = q.get('take');
  if (take && take in TAKES) {
    app.rig.setTake(TAKES[take as keyof typeof TAKES]);
    document.body.dataset.take = take; // a director take shows the Door card and nothing else of the HUD (the zoom take: not even the card)
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
      /** Set a shared shader uniform (a take or a diagnosis: uHatchWeight, uEdgeGain, …). */
      uniform: (name: string, value: number) => { const u = (app.uniforms as unknown as Record<string, { value: unknown }>)[name]; if (u && typeof u.value === 'number') u.value = value; return !!u; },
      /** Director: put the camera at altitude A (no spring); returns the zoom still waiting for the engine, if any. */
      altitude: (a: number) => { app.rig.jumpTo(a); return app.rig.pending?.band ?? null; },
      pending: () => app.rig.pending?.band ?? null,
      /** Look at a band without asking the engine to zoom (a scenario whose engine stays at its own scale). */
      look: (band: 1 | 2 | 3 | 4 | 5) => { app.rig.setBand(band, true); return band; },
      /** DOM-free commands for scripted takes (a live source only): approve, reject, top up, zoom. */
      command: (c: Parameters<typeof app.command>[0]) => app.command(c),
      render: (at?: number) => { if (at !== undefined) clockT = at; app.renderFrame(clockT); return true; },
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
    if (source.drive === 'pull') await app.step(); // a push source (serve over SSE) ticks on its own
    app.clock?.start();
  }
}

void main();
