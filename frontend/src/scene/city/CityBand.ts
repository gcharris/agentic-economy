// The city (Stage 3, DESIGN §7): one InstancedMesh of hex prisms (TileMesh) whose shader reads each house's truth
// texel, the Clearinghouse at (0, 0), a tube from each street's marker cell to the dome, the street lanterns, the
// foundries and data yards, the oak baseboard. The NETTED pulse, once per tick: (1) 0–240 ms the tubes fill inward;
// (2) 240–400 ms the dome flares and the block line writes the netting; (3) from 400 ms a gold ring leaves the dome
// at 40 ms per hex (the tile shader, from the pulse ring); (4) every SETTLED in the same frame ticks its
// destination rim --sage for 300 ms. No cats from Stage 3 up.

import * as THREE from 'three';
import type { SceneBand, SceneContext, SceneEvent } from '../../app/App.ts';
import { TileMesh } from '../../engine/gpu/TileMesh.ts';
import { PULSE_KIND } from '../../engine/store/clips.ts';
import type { Frame } from '../../engine/source/EngineSource.ts';
import { buildClearinghouse, flareAt, setFlare, type Clearinghouse } from './clearinghouse.ts';
import { buildBaseboard, buildFoundry, buildLanterns, buildYard } from './dressing.ts';
import { buildTube, setFill, type Tube } from './tubes.ts';

export const CITY_VISIBLE_ABOVE = 2.5;
const GOLD2 = new THREE.Color('#b98626'), EMBER = new THREE.Color('#c95140'), OFF = new THREE.Color('#000000');

export class CityBand implements SceneBand {
  readonly stage = 3 as const;
  readonly group = new THREE.Group();
  tiles!: TileMesh;
  hall: Clearinghouse | null = null;
  readonly tubes: Tube[] = [];
  lanterns: THREE.InstancedMesh | null = null;
  /** The last NETTED: its start and gross (the tubes' width). */
  netted: { t0: number; tick: number; gross: number } | null = null;
  private lanternCells: { id: number; street: number | null }[] = [];
  private ctx!: SceneContext;
  private layoutKey = '';

  mount(ctx: SceneContext): void {
    this.ctx = ctx;
    this.group.name = 'band-3';
    this.group.visible = false;
    this.tiles = new TileMesh(ctx.uniforms);
    ctx.scene.add(this.group);
  }

  private rebuild(): void {
    const { store } = this.ctx;
    const layout = store.layout.current;
    for (const o of [...this.group.children]) this.group.remove(o);
    this.tubes.length = 0;
    this.group.add(this.tiles.build(layout, store));
    const root = layout.root === null ? undefined : store.node(layout.root);
    if (root && root.stage !== 'House') {
      this.hall = buildClearinghouse();
      this.group.add(this.hall.group);
    }
    for (const sid of layout.streets.keys()) {
      const marker = layout.cell.get(sid);
      if (!marker || (marker.q === 0 && marker.r === 0)) continue; // a root street has no tube to itself
      const t = buildTube(marker);
      this.tubes.push(t);
      this.group.add(t.group);
    }
    const houses = this.tiles.tiles.filter((t) => t.kind === 1);
    this.lanternCells = houses.map((t) => ({ id: t.id!, street: t.street }));
    this.lanterns = buildLanterns(houses.map((t) => t.axial));
    this.group.add(this.lanterns);
    for (const c of layout.dressing.foundries) this.group.add(buildFoundry(c));
    for (const c of layout.dressing.yards) this.group.add(buildYard(c));
    this.group.add(buildBaseboard(layout.radius + 2));
  }

  onFrame(frame: Frame): void {
    const { store } = this.ctx;
    if (store.layout.key !== this.layoutKey) { this.layoutKey = store.layout.key; this.rebuild(); }
    this.tiles.update(store);
    // Street lanterns: a state read each tick. Gold-2 at rest, ember while any house on the street is halted, off when packed.
    if (this.lanterns) {
      const halted = new Set<number>();
      for (const l of this.lanternCells) if (l.street !== null && store.node(l.id)?.status === 'halted') halted.add(l.street);
      this.lanternCells.forEach((l, i) => {
        const n = store.node(l.id);
        const c = n?.status === 'packed' || n?.status === 'partitioned' ? OFF : l.street !== null && halted.has(l.street) ? EMBER : GOLD2;
        this.lanterns!.setColorAt(i, c);
      });
      if (this.lanterns.instanceColor) this.lanterns.instanceColor.needsUpdate = true;
    }
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
        this.tiles.tickSage(ev.to, this.netted && this.netted.tick === ev.tick ? this.netted.t0 + 0.4 : t0);
        break;
      case 'TOPPED_UP': { // the scorch clears at once on TOPPED_UP
        const cell = this.ctx.store.layout.cellOf(ev.node);
        const p = this.ctx.store.pulses;
        if (!cell) break;
        p.entries.forEach((e, i) => {
          if (e && e.kind === PULSE_KIND.SLASHED && e.origin.q === cell.q && e.origin.r === cell.r) { p.uPulses[i * 4] = 0; p.entries[i] = null; p.dirty = true; }
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

  dispose(): void { this.ctx?.scene.remove(this.group); this.tiles?.dispose(); }
}
