// The country (Stage 4, DESIGN §2c, §2c.1, §8): the country plate is terraced below its cities (the plates are App's);
// this band adds the High Court's line, a --paper inlay at 40 % along the country's rim with a --brass pin every 10°
// ("nothing crosses it without a mark"), and the court's beats: ROLLED_BACK is the visible unwind, a paper sweep crossing
// the plate from the centre to the case edge over 900 ms while the plate draws down toward the fog tint (the ticker
// rewinds in the HUD); SLASHED's flash and scorch are the plate shader's (the pulse ring); VOIDED strikes the feed line.
// The plateau (DESIGN §10, 3 → 4, [3.35, 3.65]): the line and its pins come up out of the plate.

import * as THREE from 'three';
import type { SceneBand, SceneContext, SceneEvent } from '../../app/App.ts';
import type { Plate } from '../../engine/layout/layoutBulbs.ts';
import type { Frame } from '../../engine/source/EngineSource.ts';
import { weight } from '../camera/Dissolve.ts';

export const UNWIND = 0.9;
const PIN_STEP = (10 * Math.PI) / 180;

export class CountryBand implements SceneBand {
  readonly stage = 4 as const;
  readonly group = new THREE.Group();
  country: Plate | null = null;
  /** The last ROLLED_BACK: its start, the block it unwound to, the forgers it slashed. */
  rollback: { t0: number; toTick: number; slashed: number } | null = null;
  private ctx!: SceneContext;
  private layoutKey = '';
  private readonly inlay = new THREE.MeshBasicMaterial({ color: '#f0e6d2', transparent: true, opacity: 0.4, depthWrite: false });
  private readonly sweepMat = new THREE.MeshBasicMaterial({ color: '#f0e6d2', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  private readonly veilMat = new THREE.MeshBasicMaterial({ color: '#4f4740', transparent: true, opacity: 0, depthWrite: false });
  private sweep: THREE.Mesh | null = null;
  private veil: THREE.Mesh | null = null;
  private pins: THREE.InstancedMesh | null = null;
  private a = 1;

  mount(ctx: SceneContext): void {
    this.ctx = ctx;
    this.group.name = 'band-4';
    ctx.scene.add(this.group);
  }

  private rebuild(): void {
    const layout = this.ctx.store.layout.current;
    this.group.clear();
    const root = layout.root === null ? undefined : layout.plates.get(layout.root);
    this.country = root && root.stage === 'Country' ? root : null;
    if (!this.country) return;
    // Every country carries its court's line (the world has several); the unwind plays on the first.
    const countries = layout.trees.map((t) => layout.plates.get(t.id)!).filter((p) => p.stage === 'Country');
    const n = Math.round((2 * Math.PI) / PIN_STEP);
    const pinR = Math.max(0.6, this.country.r * 0.009);
    this.pins = new THREE.InstancedMesh(new THREE.CylinderGeometry(pinR, pinR, pinR, 10).translate(0, pinR / 2, 0),
      new THREE.MeshLambertMaterial({ color: '#a8842e', emissive: '#a8842e', emissiveIntensity: 0.25 }), n * countries.length);
    const m = new THREE.Matrix4();
    countries.forEach((c, k) => {
      // The line reads at country scale: 0.3 m in DESIGN §8's card model, here a fixed share of the rim (≥ 1.5 m).
      const w = Math.max(1.5, c.r * 0.022), inset = Math.max(3.0, c.r * 0.03);
      const line = new THREE.Mesh(new THREE.RingGeometry(c.r - inset - w, c.r - inset, 192).rotateX(-Math.PI / 2), this.inlay);
      line.position.set(c.cx, c.top + 0.03, c.cz);
      line.renderOrder = 2;
      this.group.add(line);
      for (let i = 0; i < n; i++) {
        const t = i * PIN_STEP, rr = c.r - inset - w / 2;
        this.pins!.setMatrixAt(k * n + i, m.makeTranslation(c.cx + Math.cos(t) * rr, c.top, c.cz + Math.sin(t) * rr));
      }
    });
    const c = this.country;
    this.sweep = new THREE.Mesh(new THREE.RingGeometry(0.92, 1.0, 128).rotateX(-Math.PI / 2), this.sweepMat);
    this.sweep.position.set(c.cx, c.top + 0.08, c.cz);
    this.sweep.renderOrder = 3;
    this.veil = new THREE.Mesh(new THREE.CircleGeometry(c.r, 128).rotateX(-Math.PI / 2), this.veilMat);
    this.veil.position.set(c.cx, c.top + 0.02, c.cz);
    this.veil.renderOrder = 1;
    this.group.add(this.pins, this.sweep, this.veil);
  }

  onFrame(frame: Frame): void {
    const { store } = this.ctx;
    if (store.layout.key !== this.layoutKey) { this.layoutKey = store.layout.key; this.rebuild(); }
    void frame;
  }

  onEvent(se: SceneEvent): void {
    if (se.seeked || se.ev.type !== 'ROLLED_BACK') return;
    this.rollback = { t0: se.clip?.t0 ?? se.arrivedAt, toTick: se.ev.to_tick, slashed: se.ev.slashed };
  }

  setAltitude(a: number): void {
    this.a = a;
    const w = weight(a, 3.35, 3.65);
    this.group.visible = w > 0.001 && this.country !== null;
    this.inlay.opacity = 0.4 * w;
    if (this.pins) this.pins.scale.y = Math.max(0.001, w);
  }

  /** The unwind at app time t: 0 before and after, the sweep's progress (0–1) during. */
  unwindAt(t: number): number {
    if (!this.rollback) return 0;
    const k = (t - this.rollback.t0) / UNWIND;
    return k >= 0 && k <= 1 ? k : 0;
  }

  animate(t: number): void {
    if (!this.country || !this.sweep || !this.veil) return;
    const k = this.unwindAt(t);
    const on = k > 0 && k < 1;
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    this.sweep.visible = on;
    this.sweep.scale.setScalar(Math.max(0.01, e * (this.country.r - 3)));
    this.sweepMat.opacity = on ? 0.85 * Math.sin(Math.PI * k) : 0;
    this.veil.visible = on;
    this.veilMat.opacity = on ? 0.45 * Math.sin(Math.PI * k) : 0;
    void this.a;
  }

  dispose(): void { this.ctx?.scene.remove(this.group); }
}
