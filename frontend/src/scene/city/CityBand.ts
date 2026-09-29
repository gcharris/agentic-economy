// The city (Stage 3, DESIGN §7 and §2c): the plates are App's (TileMesh, every node a bulb on its parent's rim); this
// band adds the Clearinghouse at the city plate's centre, a tube from each street's attach point to the dome, a
// lantern on each house plate's outward rim, and the foundries and data yards on their satellite plates. The NETTED pulse, once per tick: (1) 0–240 ms the tubes fill inward;
// (2) 240–400 ms the dome flares and the block line writes the netting; (3) from 400 ms a gold ring leaves the dome
// at 40 ms per hex (the tile shader, from the pulse ring); (4) every SETTLED in the same frame ticks its
// destination rim --sage for 300 ms. No cats from Stage 3 up.

import * as THREE from 'three';
import type { SceneBand, SceneContext, SceneEvent } from '../../app/App.ts';
import { attachPoint } from '../../engine/layout/layoutBulbs.ts';
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
    this.hall = null;
    const root = layout.root === null ? undefined : layout.plates.get(layout.root);
    if (!root || root.stage !== 'City') return; // the city band draws a city; a house or street run has none
    this.hall = buildClearinghouse(root.top);
    this.hall.group.position.set(root.cx, 0, root.cz);
    this.group.add(this.hall.group);
    for (const p of layout.plates.values()) {
      if (p.stage !== 'Street' || p.parent !== root.id) continue;
      // A tube from the street's attach point on the rim to the dome, with trees along it.
      const at = attachPoint(p, root);
      const t = buildTube(at, { x: root.cx, z: root.cz });
      t.group.position.y += root.top;
      this.tubes.push(t);
      this.group.add(t.group, buildTubeTrees(at, { x: root.cx, z: root.cz }, root.top, 18));
    }
    for (const s of layout.satellites) this.group.add(s.kind === 'foundry' ? buildFoundry(s, root.top) : buildYard(s, root.top));
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

  setAltitude(a: number): void { this.group.visible = a > CITY_VISIBLE_ABOVE; }

  animate(t: number): void {
    if (!this.group.visible || !this.netted) { if (this.hall) setFlare(this.hall, 0); return; }
    const age = t - this.netted.t0;
    for (const tube of this.tubes) setFill(tube, age, this.netted.gross);
    if (this.hall) setFlare(this.hall, flareAt(age));
  }

  dispose(): void { this.ctx?.scene.remove(this.group); }
}
