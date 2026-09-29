// The city (Stage 3, DESIGN §7 and §2c): the plates are App's (TileMesh, every node a bulb on its parent's rim); this
// band adds the Clearinghouse at the city plate's centre, a tube from each street's attach point to the dome, a
// lantern on each house plate's outward rim, and the foundries and data yards on their satellite plates. The NETTED pulse, once per tick: (1) 0–240 ms the tubes fill inward;
// (2) 240–400 ms the dome flares and the block line writes the netting; (3) from 400 ms a gold ring leaves the dome
// at 40 ms per hex (the tile shader, from the pulse ring); (4) every SETTLED in the same frame ticks its
// destination rim --sage for 300 ms. No cats from Stage 3 up.

import * as THREE from 'three';
import type { SceneBand, SceneContext, SceneEvent } from '../../app/App.ts';
import { attachPoint } from '../../engine/layout/layoutBulbs.ts';
import { weight } from '../camera/Dissolve.ts';
import { PULSE_KIND } from '../../engine/store/clips.ts';
import type { Frame } from '../../engine/source/EngineSource.ts';
import { buildClearinghouse, flareAt, setFlare, type Clearinghouse } from './clearinghouse.ts';
import { buildFoundry, buildTubeTrees, buildYard } from './dressing.ts';
import { buildTube, setFill, type Tube } from './tubes.ts';

export const CITY_VISIBLE_ABOVE = 2.5;

export class CityBand implements SceneBand {
  readonly stage = 3 as const;
  readonly group = new THREE.Group();
  hall: Clearinghouse | null = null;
  readonly halls: Clearinghouse[] = [];
  readonly tubes: Tube[] = [];
  /** The last NETTED: its start and gross (the tubes' width). */
  netted: { t0: number; tick: number; gross: number } | null = null;
  private ctx!: SceneContext;
  private layoutKey = '';

  mount(ctx: SceneContext): void {
    this.ctx = ctx;
    this.group.name = 'band-3';
    this.group.visible = false;
    ctx.scene.add(this.group);
  }

  private rebuild(): void {
    const { store } = this.ctx;
    const layout = store.layout.current;
    for (const o of [...this.group.children]) this.group.remove(o);
    this.tubes.length = 0;
    this.halls.length = 0;
    // Every city plate (a country holds several): its Clearinghouse, a tube from each street's attach point with trees
    // along it, and its foundries and yards between the streets.
    for (const city of layout.plates.values()) {
      if (city.stage !== 'City') continue;
      const hall = buildClearinghouse(city.top);
      hall.group.position.set(city.cx, 0, city.cz);
      // A city with no streets (scenario 4's are leaves) is a 6.5 m plate: the hall scales with its plate so the plate,
      // and the court's scorch on it, stay visible.
      const k = Math.min(1, Math.max(0.3, city.r / 18));
      hall.group.scale.setScalar(k);
      hall.group.position.y = city.top * (1 - k); // the base stays on the plate: y' = top·(1 − k) + k·top
      this.halls.push(hall);
      this.group.add(hall.group);
      for (const p of layout.plates.values()) {
        if (p.stage !== 'Street' || p.parent !== city.id) continue;
        const at = attachPoint(p, city);
        const t = buildTube(at, { x: city.cx, z: city.cz });
        t.group.position.y += city.top;
        this.tubes.push(t);
        this.group.add(t.group, buildTubeTrees(at, { x: city.cx, z: city.cz }, city.top, 18));
      }
    }
    for (const s of layout.satellites) {
      const top = layout.plates.get(s.city)?.top ?? 0;
      this.group.add(s.kind === 'foundry' ? buildFoundry(s, top) : buildYard(s, top));
    }
    this.hall = this.halls[0] ?? null;
  }

  onFrame(frame: Frame): void {
    const { store } = this.ctx;
    if (store.layout.key !== this.layoutKey) { this.layoutKey = store.layout.key; this.rebuild(); }
    void frame;
  }

  onEvent(se: SceneEvent): void {
    if (se.seeked) return;
    const ev = se.ev;
    const t0 = se.clip?.t0 ?? se.arrivedAt;
    switch (ev.type) {
      case 'NETTED':
        this.netted = { t0: se.arrivedAt, tick: ev.tick, gross: ev.gross };
        break;
      case 'SETTLED': // beat 4: in the NETTED frame, the tick lands with the ring; otherwise at once
        this.ctx.tiles.tickSage(ev.to, this.netted && this.netted.tick === ev.tick ? this.netted.t0 + 0.4 : t0);
        break;
      case 'TOPPED_UP': { // the scorch clears at once on TOPPED_UP
        const cell = this.ctx.store.layout.plateOf(ev.node);
        const p = this.ctx.store.pulses;
        if (!cell) break;
        p.entries.forEach((e, i) => {
          if (e && e.kind === PULSE_KIND.SLASHED && Math.hypot(e.origin.x - cell.cx, e.origin.z - cell.cz) < 0.5) { p.uPulses[i * 4] = 0; p.entries[i] = null; p.dirty = true; }
        });
        break;
      }
      default: break;
    }
  }

  /** The baseboard (DESIGN §10, 2 → 3): over [2.35, 2.65] the city's fixtures rise out of the plate. */
  setAltitude(a: number): void {
    const w = weight(a, 2.35, 2.65);
    this.group.visible = w > 0.001;
    this.group.scale.y = Math.max(0.001, w);
  }

  animate(t: number): void {
    if (!this.group.visible || !this.netted) { for (const h of this.halls) setFlare(h, 0); return; }
    const age = t - this.netted.t0;
    for (const tube of this.tubes) setFill(tube, age, this.netted.gross);
    for (const h of this.halls) setFlare(h, flareAt(age));
  }

  dispose(): void { this.ctx?.scene.remove(this.group); }
}
