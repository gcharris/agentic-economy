// App: boot, accept(frame), command(), the render loop (ARCHITECTURE §4, §5). The one place a Frame
// enters the store; bands see it only through onFrame / onEvent, the render loop never reads it.

import * as THREE from 'three';
import type { EnvelopeId, NodeId } from '../engine/contract/state.ts';
import type { Decision, EngineSource, Frame, SourceHello } from '../engine/source/EngineSource.ts';
import { nowSeconds } from '../engine/source/EngineSource.ts';
import { TickClock } from '../engine/source/TickClock.ts';
import type { Band, LightingState, QualityPreset, SceneBus, SceneEvent } from '../engine/store/bus.ts';
import type { ClipScheduler } from '../engine/store/clips.ts';
import { acceptFrame } from '../engine/store/reducer.ts';
import { NOOP_UI, Store, type UiLayer } from '../engine/store/Store.ts';
import type { LayoutHandle } from '../engine/layout/layoutCity.ts';
import { AltitudeRig } from '../scene/camera/AltitudeRig.ts';
import type { Renderer } from './Renderer.ts';

export type { SceneEvent } from '../engine/store/bus.ts';

export interface Projected { x: number; y: number; depth: number; visible: boolean }

export interface SceneBand {
  readonly stage: Band;
  mount(ctx: SceneContext): void;
  onFrame(frame: Frame): void;
  onEvent(ev: SceneEvent): void;
  setAltitude(a: number): void;
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
}

/** What the DOM asks of the engine. The answer returns only as a later Frame. */
export type Command =
  | { decision: 'approve' | 'reject'; envelope: EnvelopeId; description?: string }
  | { decision: 'top_up'; node: NodeId; credits: number }
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
  hello: SourceHello | null = null;
  ready = false;
  private ctx: SceneContext | null = null;
  private raf = 0;
  private reduces = 0;
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
      lighting: opts.lighting ?? { preset: 'golden', blend: 0, cycle: false },
      reducedMotion: opts.reducedMotion ?? false,
    };
    const ui = opts.ui ?? (async (a: App) => (await import('../ui/index.ts')).createUi(a, opts.root ?? document));
    app.ui = typeof ui === 'function' ? await ui(app) : ui;
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
    const events = acceptFrame(frame, this.store, this.ui);
    this.reduces++;
    this.rig.follow(this.store);
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
      case 'top_up': ok = await s.topUp(c.node, c.credits); break;
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
    this.rig.update(t, this.renderer.camera);
    for (const b of this.bands) { b.setAltitude(this.rig.a); b.animate?.(t); }
    this.renderer.render();
  }

  project(p: THREE.Vector3): Projected {
    const cam = this.renderer.camera;
    const v = p.clone().project(cam);
    const size = this.renderer.kind === 'null' ? { w: 1280, h: 720 } : { w: innerWidth, h: innerHeight };
    return { x: (v.x * 0.5 + 0.5) * size.w, y: (-v.y * 0.5 + 0.5) * size.h, depth: v.z, visible: v.z > -1 && v.z < 1 };
  }

  /** Where the focused house's Door (east wall, x = 4.0, lintel at 2.1 m) falls on screen; null headless. */
  doorScreen(): { x: number; y: number } | null {
    if (this.renderer.kind === 'null') return null;
    const p = new THREE.Vector3(4.0, 2.1, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.rig.frameYaw).add(this.rig.origin);
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
    this.source.dispose();
    this.renderer.dispose();
  }
}
