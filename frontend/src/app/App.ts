// App: boot, accept(frame), command(), the render loop (ARCHITECTURE §4, §5). The one place a Frame
// enters the store; bands see it only through onFrame / onEvent, the render loop never reads it.

import * as THREE from 'three';
import type { EnvelopeId, NodeId } from '../engine/contract/state.ts';
import type { Decision, EngineSource, Frame, SourceHello } from '../engine/source/EngineSource.ts';
import { nowSeconds } from '../engine/source/EngineSource.ts';
import { TICK_SECONDS_BY_BAND, TickClock } from '../engine/source/TickClock.ts';
import type { Band, LightingState, QualityPreset, SceneBus, SceneEvent } from '../engine/store/bus.ts';
import type { ClipScheduler } from '../engine/store/clips.ts';
import { acceptFrame } from '../engine/store/reducer.ts';
import { NOOP_UI, Store, type UiLayer } from '../engine/store/Store.ts';
import type { LayoutHandle } from '../engine/layout/layoutBulbs.ts';
import { AltitudeRig } from '../scene/camera/AltitudeRig.ts';
import { Labels } from '../ui/labels.ts';
import { presetForBand, WorldLights } from './lighting.ts';
import { TruthBuffer } from '../engine/gpu/TruthBuffer.ts';
import { EDGE_GAIN, TileMesh } from '../engine/gpu/TileMesh.ts';
import { Dissolve, globeWeight, weight } from '../scene/camera/Dissolve.ts';
import { createUniforms, uploadPulses, type SharedUniforms } from '../engine/gpu/uniforms.ts';
import type { Renderer } from './Renderer.ts';

export type { SceneEvent } from '../engine/store/bus.ts';

export interface Projected { x: number; y: number; depth: number; visible: boolean }

export interface SceneBand {
  readonly stage: Band;
  mount(ctx: SceneContext): void;
  onFrame(frame: Frame): void;
  onEvent(ev: SceneEvent): void;
  setAltitude(a: number): void;
  /** The band's root object, when it has one (App hides the flat bands under the globe). */
  readonly group?: THREE.Object3D;
  /** Per render frame: advance clip-driven motion to app time `t` (seconds). Reads clips and uniforms only. */
  animate?(t: number): void;
  dispose(): void;
}

export interface SceneContext {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer | null;
  camera: THREE.PerspectiveCamera;
  rig: AltitudeRig;
  layout: LayoutHandle;
  store: Store;
  bus: SceneBus;
  clips: ClipScheduler;
  project: (p: THREE.Vector3) => Projected;
  quality: QualityPreset;
  lighting: LightingState;
  reducedMotion: boolean;
  truth: TruthBuffer;
  uniforms: SharedUniforms;
  /** The plates every band stands on (DESIGN §2c), owned by App. */
  tiles: TileMesh;
}

/** What the DOM asks of the engine. The answer returns only as a later Frame. */
export type Command =
  | { decision: 'approve' | 'reject'; envelope: EnvelopeId; description?: string }
  | { decision: 'answer'; node: NodeId; offer: EnvelopeId; answer: 'send' | 'hire' | 'ask' | 'leave' }
  | { decision: 'close'; node: NodeId }
  | { decision: 'top_up'; node: NodeId; credits: number }
  | { decision: 'sync'; node: NodeId }
  | { decision: 'zoom'; stage: Band };

export interface AppOptions {
  source: EngineSource;
  renderer: Renderer;
  /** Where the shell (index.html's body) lives; App never creates it. */
  root?: ParentNode;
  /** The DOM layer. Default: the ui lane's, loaded lazily so a headless unit test can pass NOOP_UI. */
  ui?: UiLayer | ((app: App) => UiLayer | Promise<UiLayer>);
  bands?: SceneBand[];
  /** 'manual': no TickClock and no rAF loop; tests and takes step explicitly. */
  clock?: 'auto' | 'manual';
  quality?: QualityPreset;
  lighting?: LightingState;
  reducedMotion?: boolean;
  /** Test/director hook: fixed app time instead of performance.now(). */
  now?: () => number;
}

export class App {
  readonly store = new Store();
  readonly rig = new AltitudeRig();
  readonly bands: SceneBand[] = [];
  readonly clock: TickClock | null;
  ui: UiLayer = NOOP_UI;
  lights: WorldLights | null = null;
  labels: Labels | null = null;
  dissolve: Dissolve | null = null;
  readonly truth = new TruthBuffer();
  readonly uniforms = createUniforms(this.truth);
  readonly tiles = new TileMesh(this.uniforms);
  private platesKey = '';
  hello: SourceHello | null = null;
  ready = false;
  private ctx: SceneContext | null = null;
  private raf = 0;
  private reduces = 0;
  private tickBand: Band = 1;
  private readonly unsub: (() => void)[] = [];
  private readonly now: () => number;

  private constructor(readonly opts: AppOptions) {
    this.now = opts.now ?? nowSeconds;
    const manual = opts.clock === 'manual';
    this.clock = !manual && opts.source.drive === 'pull' ? new TickClock(opts.source) : null;
  }

  static async boot(opts: AppOptions): Promise<App> {
    const app = new App(opts);
    const { source, renderer } = opts;
    app.ctx = {
      scene: renderer.scene, renderer: renderer.gl, camera: renderer.camera, rig: app.rig,
      layout: app.store.layout, store: app.store, bus: app.store.bus, clips: app.store.clips,
      project: (p) => app.project(p),
      quality: opts.quality ?? 'balanced',
      lighting: opts.lighting ?? { preset: presetForBand(1, null), blend: 0, cycle: false },
      reducedMotion: opts.reducedMotion ?? false,
      truth: app.truth, uniforms: app.uniforms, tiles: app.tiles,
    };
    app.store.truthSink = app.truth;
    app.uniforms.uReducedMotion.value = opts.reducedMotion ? 1 : 0;
    app.uniforms.uHatchWeight.value = opts.reducedMotion ? 0.85 : 0.35;
    const ui = opts.ui ?? (async (a: App) => (await import('../ui/index.ts')).createUi(a, opts.root ?? document));
    app.ui = typeof ui === 'function' ? await ui(app) : ui;
    app.labels = new Labels((opts.root ?? (typeof document !== 'undefined' ? document : null))?.querySelector?.<HTMLElement>('#labels') ?? null, app.store.bus, app.now, (p) => app.project(p));
    renderer.scene.add(renderer.camera); // the camera carries the dissolve veil
    app.dissolve = new Dissolve(renderer.camera, opts.reducedMotion ?? false);
    app.lights = new WorldLights(app.ctx.lighting, app.ctx.quality !== 'low' && renderer.kind === 'webgl');
    renderer.scene.add(app.lights.group);
    app.rig.onZoom = (b) => { if (source.live) void app.command({ decision: 'zoom', stage: b }); };
    for (const b of opts.bands ?? []) app.register(b);
    app.unsub.push(source.onFrame((f) => app.accept(f)));
    app.unsub.push(source.onStatus((s) => { app.store.status = s; app.store.bus.emit('status', s); }));
    app.hello = await source.start();
    app.store.hello = app.hello;
    if (app.hello.tickSeconds && app.clock) app.clock.tickSeconds = app.hello.tickSeconds;
    app.ready = true;
    if (opts.clock !== 'manual' && typeof requestAnimationFrame === 'function') app.loop();
    return app;
  }

  get source(): EngineSource { return this.opts.source; }
  get renderer(): Renderer { return this.opts.renderer; }
  get reduceCount(): number { return this.reduces; }

  register(band: SceneBand): void {
    this.bands.push(band);
    if (this.ctx) band.mount(this.ctx);
  }

  /** One frame from the source: the store, the reducer, the DOM, then the bands (§4 steps 2–4). */
  accept(frame: Frame): void {
    frame.arrivedAt = this.now(); // "app clock seconds when accepted": one clock for clips and the render loop
    this.uniforms.uTickT.value = frame.arrivedAt;
    const events = acceptFrame(frame, this.store, this.ui);
    this.reduces++;
    if (this.store.layout.key !== this.platesKey) { // the plates are rebuilt only when the (id, parent) set changed
      this.platesKey = this.store.layout.key;
      this.renderer.scene.add(this.tiles.build(this.store.layout.current, this.store));
    }
    this.tiles.update(this.store);
    this.rig.follow(this.store, frame, !this.source.live);
    for (const b of this.bands) b.onFrame(frame);
    for (const se of events) for (const b of this.bands) b.onEvent(se);
  }

  /** DOM → engine. Recorded runs answer false; the Door says so in its caption. */
  async command(c: Command): Promise<boolean> {
    const s = this.source;
    const tick = this.store.frame?.tick ?? 0;
    let ok = false;
    switch (c.decision) {
      case 'approve': ok = await s.authorize(c.envelope); break;
      case 'reject': ok = await s.reject(c.envelope); break;
      case 'answer': ok = await s.answer?.(c.node, c.offer, c.answer) ?? false; break;
      case 'close': ok = await s.close?.(c.node) ?? false; break;
      case 'top_up': ok = await s.topUp(c.node, c.credits); break;
      case 'sync': ok = await s.sync(c.node); break;
      case 'zoom': ok = await s.zoom(c.stage); break;
    }
    if (ok) this.store.pendingDecisions.push({ tick, ...c } as Decision);
    return ok;
  }

  step(): Promise<Frame | null> { return this.clock ? this.clock.stepOnce() : this.source.step(); }

  async stepTo(tick: number): Promise<Frame | null> {
    let f: Frame | null = this.store.frame;
    while (!f || f.tick < tick) {
      f = await this.source.step();
      if (!f) break;
    }
    return f;
  }

  frame(): Frame | null { return this.store.frame; }

  /** One render frame at app time t: rig, bands, draw. Reads no Frame. */
  renderFrame(t = this.now()): void {
    this.rig.rows = this.renderer.rows;
    this.rig.update(t, this.renderer.camera);
    const band = this.rig.band;
    if (band !== this.tickBand) { // tick seconds follow the band: 1.2 s in the room, 0.25 s in orbit
      this.tickBand = band;
      this.store.tickSeconds = TICK_SECONDS_BY_BAND[band];
      if (this.clock) this.clock.tickSeconds = TICK_SECONDS_BY_BAND[band];
      // DESIGN §2b: Golden in the room, Noon outdoors, unless the person chose a preset; the key casts only outdoors.
      if (this.lights) {
        this.lights.setPreset(presetForBand(band, this.opts.lighting?.preset ?? null));
        this.lights.key.castShadow = this.lights.shadows && band >= 2 && band <= 4; // no shadow map a globe wide
        this.ctx!.lighting = { ...this.ctx!.lighting, preset: this.lights.preset! };
      }
    }
    this.lights?.follow(this.rig.lookTarget, this.rig.viewH);
    // The shared uniforms: numbers only, no Frame (ARCHITECTURE §4.5).
    const u = this.uniforms;
    // Rim fray reads at every altitude: ×1 in the room rising to ×3 at the city, so a drifted street is a coastline from above.
    u.uEdgeGain.value = EDGE_GAIN * (1 + 2 * weight(this.rig.visualA, 1.5, 3.0));
    this.dissolve?.update(this.rig.visualA, this.renderer.camera);
    u.uTime.value = t; u.uAltitude.value = this.rig.visualA; u.uTickSeconds.value = this.store.tickSeconds;
    u.uPxPerUnit.value = this.renderer.rows / Math.max(1e-3, this.rig.viewH); u.uBurnRef.value = this.store.burnRef;
    if (this.lights) {
      const k = this.lights.key, h = this.lights.hemi;
      u.uKeyDir.value.copy(k.position).sub(k.target.position).normalize();
      u.uKeyColor.value.copy(k.color).multiplyScalar(k.intensity / Math.PI);
      u.uHemiSky.value.copy(h.color).multiplyScalar(h.intensity / Math.PI);
      u.uHemiGround.value.copy(h.groundColor).multiplyScalar(h.intensity / Math.PI);
    }
    if (this.store.pulses.dirty) { uploadPulses(u, this.store.pulses.uPulses, this.store.pulses.uPulseData); this.store.pulses.markClean(); }
    const a = this.rig.visualA;
    for (const b of this.bands) { b.setAltitude(a); b.animate?.(t); }
    // The globe (DESIGN §10, 4 → 5): night falls over the country (the veil in the World's ground colour), which stays
    // visible under it until the globe comes in at the veil's peak; then the flat world, plates, ground and every lower
    // band, is gone (the relief would stand through the sphere, whose tangent there is not the ground's).
    const flat = globeWeight(a) < 0.5;
    this.tiles.group.visible = flat;
    if (!flat) for (const b of this.bands) if (b.stage < 5 && b.group) b.group.visible = false;
    this.labels?.frame(t);
    this.renderer.render();
  }

  project(p: THREE.Vector3): Projected {
    const cam = this.renderer.camera;
    const v = p.clone().project(cam);
    const size = this.renderer.kind === 'null' ? { w: 1280, h: 720 } : { w: innerWidth, h: innerHeight };
    return { x: (v.x * 0.5 + 0.5) * size.w, y: (-v.y * 0.5 + 0.5) * size.h, depth: v.z, visible: v.z > -1 && v.z < 1 };
  }

  /** Where the focused house's Door (east wall, x = 4.0, mid-height 1.0 m) falls on screen; null headless. */
  doorScreen(): { x: number; y: number } | null {
    if (this.renderer.kind === 'null') return null;
    const p = new THREE.Vector3(4.0, 1.0, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.rig.frameYaw).add(this.rig.origin);
    const s = this.project(p);
    return s.visible ? s : null;
  }

  private loop(): void {
    const tick = () => { this.renderFrame(); this.raf = requestAnimationFrame(tick); };
    this.raf = requestAnimationFrame(tick);
  }

  dispose(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.clock?.pause();
    for (const u of this.unsub) u();
    for (const b of this.bands) b.dispose();
    this.ui.dispose?.();
    this.labels?.dispose();
    this.source.dispose();
    this.truth.dispose();
    this.tiles.dispose();
    this.renderer.dispose();
  }
}
