// The street (Stage 2, DESIGN §6): every house on its tile with its roof on, the kerb through the ring's stones,
// the Letter Slots, chimneys and lanterns read from state, and couriers born only from events. Neighbours keep
// their roofs on at every altitude: nothing is shared by default. The focused house's body is hidden while the
// room is drawn (A < 1.5), so the hero wide shows the open room beyond which the cottages sit with lids on.

import * as THREE from 'three';
import type { SceneBand, SceneContext, SceneEvent } from '../../app/App.ts';
import { isHashMismatch } from '../../engine/contract/events.ts';
import { normaliseBurn, type NodeId, type NodeStatus } from '../../engine/contract/state.ts';
import { toWorld, type Axial } from '../../engine/layout/hex.ts';
import { houseYaw } from '../../engine/layout/layoutCity.ts';
import type { Frame } from '../../engine/source/EngineSource.ts';
import { buildCottage, setChimney, setLantern, SLOT_LOCAL, PLINTH_TOP, type Cottage } from './cottage.ts';
import { BEAT_EDGES, beatsStart, Courier, courierAt, STATIC, staticAt, type Run } from './couriers.ts';
import { buildKerb, buildRoad, contactShadow, dyeFor, meetingStone } from './kerb.ts';

/** The street band draws up to the city's dissolve edge; the city takes over above it. */
export const STREET_VISIBLE_UP_TO = 2.5;
/** The focused house's body appears as the lid goes on (DESIGN §10: [1.35, 1.65]). */
export const LID_ON_AT = 1.5;
const COURIER_CAP = 64;
const SLOT_REST = new THREE.Color('#b98626'), CYAN = new THREE.Color('#2aa5b8'), GOLD_LIGHT = new THREE.Color('#f2cb7a'), INK3 = new THREE.Color('#8a7a64');
const SAGE = new THREE.Color('#6a9a6e');

interface HouseState { status: NodeStatus; heat: number; delivered: number; staticAt: number; settledAt: number }

export class StreetBand implements SceneBand {
  readonly stage = 2 as const;
  readonly group = new THREE.Group();
  readonly cottages = new Map<NodeId, Cottage>();
  readonly runs = new Map<number, Run>();
  readonly couriers: Courier[] = [];
  private readonly houses = new Map<NodeId, HouseState>();
  private readonly rims = new Map<NodeId, THREE.MeshLambertMaterial>();
  private readonly cells = new Map<NodeId, Axial>();
  private readonly dyes = new Map<NodeId, THREE.Color>();
  private readonly fx = new THREE.Group();
  private ctx!: SceneContext;
  private layoutKey = '';
  private a = 1;
  private readonly settledRuns = new Set<number>();

  mount(ctx: SceneContext): void {
    this.ctx = ctx;
    this.group.name = 'band-2';
    this.group.add(this.fx);
    ctx.scene.add(this.group);
  }

  private rebuild(): void {
    const { store } = this.ctx;
    const layout = store.layout.current;
    for (const c of this.cottages.values()) this.group.remove(c.group);
    this.cottages.clear(); this.cells.clear(); this.rims.clear(); this.dyes.clear();
    for (const o of [...this.group.children]) if (o !== this.fx) this.group.remove(o);
    this.group.add(buildRoad({ q: 0, r: 0 }, Math.max(1, layout.radius)));
    for (const [sid, st] of layout.streets) {
      const full = st.cells.length >= 6 * st.ringFrom && st.ringFrom === st.ringTo;
      this.group.add(buildKerb(st.cells, full));
      void sid;
    }
    for (const [id, cell] of layout.cell) {
      const n = store.node(id);
      if (!n || n.stage !== 'House') continue;
      const c = buildCottage(id);
      const w = toWorld(cell);
      c.group.position.set(w.x, 0, w.z);
      c.group.rotation.y = houseYaw(cell);
      // Each rim gets its own material: dyed by its street (DESIGN §2b.3), ticked --sage by a settle.
      const street = [...layout.streets].find(([, st]) => st.cells.some((x) => x.q === cell.q && x.r === cell.r))?.[0];
      const dye = new THREE.Color(street === undefined ? '#4c3f30' : dyeFor(street));
      this.dyes.set(id, dye);
      const rim = new THREE.MeshLambertMaterial({ color: dye.clone(), flatShading: true });
      (c.group.children[0] as THREE.Mesh).material = rim;
      this.rims.set(id, rim);
      this.cottages.set(id, c);
      this.cells.set(id, cell);
      this.group.add(c.group);
      const shadow = contactShadow(7.2);
      shadow.position.x = w.x; shadow.position.z = w.z;
      this.group.add(shadow);
    }
  }

  onFrame(frame: Frame): void {
    const { store } = this.ctx;
    if (store.layout.key !== this.layoutKey) { this.layoutKey = store.layout.key; this.rebuild(); }
    for (const id of this.cottages.keys()) {
      const n = store.node(id);
      if (!n) continue;
      const h = this.houses.get(id) ?? { status: n.status, heat: 0, delivered: -1e9, staticAt: -1e9, settledAt: -1e9 };
      h.status = n.status;
      h.heat = n.status === 'waiting_at_door' ? 0 : normaliseBurn(n.burned_this_tick) / Math.max(1e-6, store.burnRef);
      this.houses.set(id, h);
    }
    void frame;
  }

  /** The sender's Letter Slot in world space. */
  private slotWorld(id: NodeId): THREE.Vector3 | null {
    const c = this.cottages.get(id);
    if (!c) return null;
    return SLOT_LOCAL.clone().setY(PLINTH_TOP).add(new THREE.Vector3(0.5, 0, 0)).applyAxisAngle(new THREE.Vector3(0, 1, 0), c.group.rotation.y).add(c.group.position);
  }

  onEvent(se: SceneEvent): void {
    if (se.seeked) return;
    const ev = se.ev;
    const t0 = se.clip?.t0 ?? se.arrivedAt;
    switch (ev.type) {
      case 'PROPOSED': {
        if (ev.kind !== 'hire_service') break;
        const a = this.cells.get(ev.from), b = this.cells.get(ev.to);
        const start = this.slotWorld(ev.from);
        if (!a || !b || !start) break;
        this.runs.set(ev.envelope, { envelope: ev.envelope, from: ev.from, to: ev.to, start, meet: meetingStone(a, b), t0, outcome: null });
        break;
      }
      case 'SETTLED': {
        const r = this.runs.get(ev.envelope);
        if (r) r.outcome = { kind: 'settled', t0, amount: ev.amount };
        break;
      }
      case 'REJECTED': {
        const r = this.runs.get(ev.envelope);
        if (!r) break;
        r.outcome = { kind: 'snapback', t0 };
        if (isHashMismatch(ev.reason)) for (const id of [r.from, r.to]) { const h = id === null ? undefined : this.houses.get(id); if (h) h.staticAt = t0; }
        break;
      }
      case 'DROPPED_BY_COURIER': {
        for (const r of [...this.runs.values()].reverse()) if (r.from === ev.from && r.to === ev.to && !r.outcome) { r.outcome = { kind: 'dropped', t0 }; break; }
        break;
      }
      case 'DELIVERED': {
        const h = this.houses.get(ev.to);
        if (h) h.delivered = t0;
        break;
      }
      default: break;
    }
  }

  setAltitude(a: number): void {
    this.a = a;
    this.group.visible = a <= STREET_VISIBLE_UP_TO;
    const focus = this.ctx.store.focus;
    for (const [id, c] of this.cottages) c.house.visible = id !== focus || a >= LID_ON_AT;
  }

  animate(t: number): void {
    if (!this.group.visible) return;
    const reduced = this.ctx.reducedMotion;
    // Couriers: one pooled figure per live run.
    let i = 0;
    const cyanSlots = new Set<NodeId>();
    for (const [env, r] of this.runs) {
      const s = courierAt(r, t);
      if (s.beat === 'done' && t > beatsStart(r) + 3) { this.runs.delete(env); this.settledRuns.delete(env); continue; }
      if (r.outcome?.kind === 'settled' && t >= beatsStart(r) + BEAT_EDGES.settle && !this.settledRuns.has(env)) { this.settledRuns.add(env); this.settle(r, t); }
      if (s.beat === 'lock' || s.beat === 'swap' || s.beat === 'verify') { cyanSlots.add(r.from); if (r.to !== null) cyanSlots.add(r.to); }
      if (i >= COURIER_CAP) continue;
      const c = this.couriers[i] ?? this.spawn();
      i++;
      c.run = r;
      c.group.visible = s.visible;
      c.group.position.copy(s.pos);
      const dir = r.meet.clone().sub(r.start);
      c.group.rotation.y = Math.atan2(dir.x, dir.z) + (s.beat === 'snap' ? Math.PI : 0);
      c.cat.pose(s.walking && !reduced ? 'walkA' : 'idle', t * 2.0);
      (c.envelope.material as THREE.MeshLambertMaterial).opacity = s.envelope;
      // Swap: the envelope and the value cross; verify: the cyan ring; settle: the seal on the stone.
      const bs = beatsStart(r), bt = t - bs;
      const swapK = Math.min(1, Math.max(0, (bt - BEAT_EDGES.lock) / (BEAT_EDGES.swap - BEAT_EDGES.lock)));
      const settled = r.outcome?.kind === 'settled' && t >= bs;
      c.envelope.position.z = settled ? -0.55 + 1.1 * swapK : -0.55;
      c.value.visible = settled && s.beat !== 'done';
      c.value.position.set(0, 0.36, 0.55 - 1.1 * swapK);
      c.ring.visible = settled && bt >= BEAT_EDGES.swap && bt < BEAT_EDGES.verify + 0.1;
      c.ring.position.copy(r.meet).setY(r.meet.y + 0.02);
      (c.ring.material as THREE.MeshBasicMaterial).opacity = c.ring.visible ? Math.sin(Math.PI * Math.min(1, (bt - BEAT_EDGES.swap) / 0.3)) * 0.8 : 0;
      c.seal.visible = settled && bt >= BEAT_EDGES.verify;
      c.seal.position.copy(r.meet).setY(r.meet.y + 0.02);
      (c.seal.material as THREE.MeshLambertMaterial).opacity = c.seal.visible ? Math.min(1, (bt - BEAT_EDGES.verify) / 0.2) * Math.max(0, 1 - Math.max(0, bt - 1.6) / 1.2) : 0;
    }
    for (; i < this.couriers.length; i++) { const c = this.couriers[i]; c.group.visible = c.ring.visible = c.seal.visible = false; c.run = null; }

    for (const [id, c] of this.cottages) {
      const h = this.houses.get(id);
      if (!h) continue;
      setLantern(c, h.status, t, reduced);
      setChimney(c, h.heat, t, reduced);
      // The Letter Slot: --gold-2 at rest, --cyan in a handshake, --gold-light 300 ms on DELIVERED, static on a hash mismatch.
      const slot = c.slot;
      if (t - h.staticAt < STATIC) { const g = staticAt(id % 997, t); slot.emissive.copy(SLOT_REST).lerp(INK3, g * 2.5); slot.color.copy(slot.emissive); }
      else if (cyanSlots.has(id)) { slot.emissive.copy(CYAN); slot.color.copy(CYAN); slot.emissiveIntensity = 0.8; }
      else if (t - h.delivered < 0.3) { slot.emissive.copy(GOLD_LIGHT); slot.color.copy(GOLD_LIGHT); slot.emissiveIntensity = 1.0; }
      else { slot.emissive.copy(SLOT_REST); slot.color.copy(SLOT_REST); slot.emissiveIntensity = 0.25; }
      const rim = this.rims.get(id)!;
      rim.color.copy(t - h.settledAt < 0.3 ? SAGE : this.dyes.get(id)!);
    }
  }

  /** The settle beat: both rims tick --sage, and the amount rides a label over the seal. */
  private settle(r: Run, t: number): void {
    for (const id of [r.from, r.to]) { const h = id === null ? undefined : this.houses.get(id); if (h) h.settledAt = t; }
    if (r.outcome?.kind === 'settled' && this.a >= 1.5) {
      this.ctx.bus.emit('label', { id: `settle-${r.envelope}`, world: r.meet.clone().setY(r.meet.y + 0.6), text: `${r.outcome.amount.toFixed(2)}`, kind: 'caption', ttl: 1.2 });
    }
  }

  private spawn(): Courier {
    const c = new Courier();
    this.couriers.push(c);
    this.fx.add(c.group, c.ring, c.seal);
    c.group.add(c.value);
    return c;
  }

  dispose(): void {
    this.ctx?.scene.remove(this.group);
  }
}
