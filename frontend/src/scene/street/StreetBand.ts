// The street (Stage 2, DESIGN §6): every house on its tile with its roof on, the kerb through the ring's stones,
// the Letter Slots, chimneys and lanterns read from state, and couriers born only from events. Neighbours keep
// their roofs on at every altitude: nothing is shared by default. The focused house's body is hidden while the
// room is drawn (A < 1.5), so the hero wide shows the open room beyond which the cottages sit with lids on.

import * as THREE from 'three';
import type { SceneBand, SceneContext, SceneEvent } from '../../app/App.ts';
import { isHashMismatch } from '../../engine/contract/events.ts';
import { normaliseBurn, type NodeId, type NodeStatus } from '../../engine/contract/state.ts';
import type { Plate } from '../../engine/layout/layoutBulbs.ts';
import type { Frame } from '../../engine/source/EngineSource.ts';
import { buildCottage, setChimney, setLantern, SLOT_LOCAL, type Cottage } from './cottage.ts';
import { BEAT_EDGES, beatsStart, Courier, courierAt, STATIC, staticAt, type Run } from './couriers.ts';
import { buildCommons, lanternMesh, meetingStone } from './commons.ts';

/** The street band draws up to the city's dissolve edge; the city takes over above it. */
export const STREET_VISIBLE_UP_TO = 3.5; // the street's life stays in the city view (§2c.1: roof and lantern)
/** The focused house's body appears as the lid goes on (DESIGN §10: [1.35, 1.65]). */
export const LID_ON_AT = 1.5;
const COURIER_CAP = 64;
const GOLD2 = new THREE.Color('#d4a755'), EMBER = new THREE.Color('#c95140'), OFF = new THREE.Color('#1c1610');
const SLOT_REST = new THREE.Color('#b98626'), CYAN = new THREE.Color('#2aa5b8'), GOLD_LIGHT = new THREE.Color('#f2cb7a'), INK3 = new THREE.Color('#8a7a64');

interface HouseState { status: NodeStatus; heat: number; delivered: number; staticAt: number; settledAt: number }

export class StreetBand implements SceneBand {
  readonly stage = 2 as const;
  readonly group = new THREE.Group();
  readonly cottages = new Map<NodeId, Cottage>();
  readonly runs = new Map<number, Run>();
  readonly couriers: Courier[] = [];
  private readonly houses = new Map<NodeId, HouseState>();
  private readonly plates = new Map<NodeId, Plate>();
  private lanterns: THREE.InstancedMesh | null = null;
  private posts: { street: number; index: number }[] = [];
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
    this.cottages.clear(); this.plates.clear(); this.posts = [];
    for (const o of [...this.group.children]) if (o !== this.fx) this.group.remove(o);
    const housesOf = new Map<NodeId, Plate[]>();
    for (const p of layout.plates.values()) {
      if (p.stage !== 'House' || p.parent === null) continue;
      const l = housesOf.get(p.parent); if (l) l.push(p); else housesOf.set(p.parent, [p]);
    }
    // Each street plate's life: kerb ring, lantern posts, paths to the centre stone, trees (commons.ts).
    this.lanterns = lanternMesh([...housesOf.values()].reduce((n, h) => n + h.length, 0));
    let next = 0;
    for (const [sid, houses] of housesOf) {
      const street = layout.plates.get(sid);
      if (!street) continue;
      const c = buildCommons(street, houses, this.lanterns, next);
      next += c.posts.length;
      this.posts.push(...c.posts);
      this.group.add(c.group);
    }
    this.lanterns.count = next;
    this.lanterns.instanceMatrix.needsUpdate = true;
    this.group.add(this.lanterns);
    // A cottage on every house plate, its Door (and Letter Slot) facing the street's centre stone.
    for (const [id, p] of layout.plates) {
      if (p.stage !== 'House') continue;
      const c = buildCottage(id);
      c.group.position.set(p.cx, p.top, p.cz);
      c.group.rotation.y = store.layout.yawOf(id);
      this.cottages.set(id, c);
      this.plates.set(id, p);
      this.group.add(c.group);
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
    // Street lanterns: a state read each tick. Gold-2 at rest, ember while any house on the street is halted, off when packed.
    if (this.lanterns && this.posts.length) {
      const halted = new Set<NodeId>(), packed = new Set<NodeId>();
      for (const p of this.plates.values()) {
        const st = store.node(p.id)?.status;
        if (p.parent === null) continue;
        if (st === 'halted') halted.add(p.parent);
        if (st === 'packed' || st === 'partitioned') packed.add(p.parent);
      }
      for (const post of this.posts) this.lanterns.setColorAt(post.index, packed.has(post.street) ? OFF : halted.has(post.street) ? EMBER : GOLD2);
      if (this.lanterns.instanceColor) this.lanterns.instanceColor.needsUpdate = true;
    }
    void frame;
  }

  /** The sender's Letter Slot in world space. */
  private slotWorld(id: NodeId): THREE.Vector3 | null {
    const c = this.cottages.get(id);
    if (!c) return null;
    return SLOT_LOCAL.clone().setY(0).add(new THREE.Vector3(0.5, 0, 0)).applyAxisAngle(new THREE.Vector3(0, 1, 0), c.group.rotation.y).add(c.group.position);
  }

  onEvent(se: SceneEvent): void {
    if (se.seeked) return;
    const ev = se.ev;
    const t0 = se.clip?.t0 ?? se.arrivedAt;
    switch (ev.type) {
      case 'PROPOSED': {
        if (ev.kind !== 'hire_service') break;
        const a = this.plates.get(ev.from), b = this.plates.get(ev.to);
        const street = a?.parent == null ? undefined : this.ctx.store.layout.plateOf(a.parent); // the centre stone
        const start = this.slotWorld(ev.from);
        if (!a || !b || !start || !street) break;
        this.runs.set(ev.envelope, { envelope: ev.envelope, from: ev.from, to: ev.to, start, meet: meetingStone(street, a, b), t0, outcome: null });
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
    }
  }

  /** The settle beat: both rims tick --sage, and the amount rides a label over the seal. */
  private settle(r: Run, t: number): void {
    for (const id of [r.from, r.to]) if (id !== null) this.ctx.tiles.tickSage(id, t); // both rims tick --sage on the plates
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
