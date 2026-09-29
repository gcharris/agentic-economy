// The room (Stage 1, DESIGN §4): the focused house with its roof off. State is read in onFrame (status, purse,
// papers, Φ, the held envelope, the Note); motion is born only from events in onEvent; animate(t) tweens
// between the two and reads no Frame.

import * as THREE from 'three';
import type { SceneBand, SceneContext, SceneEvent } from '../../app/App.ts';
import type { EnvelopeId, NodeStatus } from '../../engine/contract/state.ts';
import type { Frame } from '../../engine/source/EngineSource.ts';
import { buildFixtures, PAPER_CAP, setPurse, type Fixtures } from './fixtures.ts';
import { RoomLights } from './lights.ts';
import { makeSeat, SEATS, type SeatActor, type SeatName } from './actors/seats.ts';
import { place, type PorterClip } from './stations.ts';

const TIER_GLOW = { fast_quantized: 0.2, balanced_staff: 0.5, frontier_deep: 1.0 } as const;
const DOOR_SWING = (70 * Math.PI) / 180;
const SYNC_SECONDS = 0.6;
/** Above this altitude the lid is on (DESIGN §10: dissolve window [1.35, 1.65]). */
export const ROOM_VISIBLE_BELOW = 1.65;

export class RoomBand implements SceneBand {
  readonly stage = 1 as const;
  readonly group = new THREE.Group();
  fx!: Fixtures;
  lights!: RoomLights;
  readonly actors = new Map<SeatName, SeatActor>();
  status: NodeStatus = 'active';
  private ctx!: SceneContext;
  private porter: PorterClip | null = null;
  private door: { open: number; t0: number } = { open: 0, t0: -1e9 };
  private sync = -1e9;
  private tip = -1e9;
  private readonly burns = new Map<SeatName, { t0: number; amp: number }>();
  private readonly mine = new Set<EnvelopeId>();

  mount(ctx: SceneContext): void {
    this.ctx = ctx;
    this.group.name = 'band-1';
    this.fx = buildFixtures();
    this.lights = new RoomLights(ctx.quality);
    this.group.add(this.fx.group, this.lights.group);
    for (const s of SEATS) {
      const a = makeSeat(s);
      this.actors.set(s, a);
      this.group.add(a.cat);
    }
    ctx.scene.add(this.group);
  }

  onFrame(frame: Frame): void {
    const { store, rig } = this.ctx;
    const n = store.focus === null ? undefined : store.node(store.focus);
    this.group.position.copy(rig.origin); // the rig's origin is the house plate's top: the terrace carries the room
    this.group.rotation.y = rig.frameYaw;
    if (!n) return;
    this.status = n.status;
    const now = frame.arrivedAt;
    this.fx.haze.setPhi(n.confidence, frame.seeked ? -1e9 : now);
    setPurse(this.fx.purseArc, n.compute_allocated > 0 ? n.compute / n.compute_allocated : 0);
    this.fx.papers.count = Math.min(PAPER_CAP, n.papers);
    this.fx.papers.instanceMatrix.needsUpdate = true;
    this.fx.note.visible = n.note !== null;
    for (const e of store.door.values()) if (e.node === n.id) this.mine.add(e.envelope);
    const asked = [...store.door.values()].some((e) => e.node === n.id) || n.note !== null;
    this.lights.setPresence(asked, frame.seeked ? -1e9 : now);
    this.lights.setHalted(n.status === 'halted', frame.seeked ? -1e9 : now);
  }

  onEvent(se: SceneEvent): void {
    if (se.seeked) return;
    const focus = this.ctx.store.focus;
    const ev = se.ev;
    const t0 = se.clip?.t0 ?? se.arrivedAt;
    switch (ev.type) {
      case 'BURN':
        if (ev.node === focus && isSeat(ev.seat)) this.burns.set(ev.seat, { t0, amp: TIER_GLOW[ev.tier] * (ev.cache_hit ? 0.5 : 1) });
        break;
      case 'PROPOSED':
        if (ev.from === focus) { this.mine.add(ev.envelope); this.porter = { kind: 'carry', t0, duration: 0.9 }; }
        break;
      case 'AWAITING_HUMAN_SIGNATURE':
        if (ev.node === focus) { this.mine.add(ev.envelope); this.ctx.bus.emit('sound', { cue: 'knock', at: t0 }); }
        break;
      case 'APPROVED':
        if (this.mine.has(ev.envelope) && ev.gate === 'House') {
          this.porter = { kind: 'seal', t0, duration: 0.6 };
          this.door = { open: 1, t0 };
          this.ctx.bus.emit('sound', { cue: 'stamp', at: t0 });
        }
        break;
      case 'REJECTED':
        if (this.mine.has(ev.envelope) && ev.gate === 'House') {
          this.porter = { kind: 'burn', t0, duration: 0.7 };
          this.ctx.bus.emit('sound', { cue: 'stamp', at: t0 });
        }
        break;
      case 'STATE_SYNC':
        if (ev.node === focus) this.sync = t0;
        break;
      case 'SEAT_FAILED':
        if (ev.node === focus) this.tip = t0;
        break;
      default: break;
    }
  }

  setAltitude(a: number): void { this.group.visible = a < ROOM_VISIBLE_BELOW; }

  animate(t: number): void {
    if (!this.group.visible) return;
    const reduced = this.ctx.reducedMotion;
    const tickS = this.ctx.store.tickSeconds;
    this.fx.haze.uniforms.uTime.value = t;
    this.fx.haze.uniforms.uReduced.value = reduced ? 1 : 0;
    const porterClip = this.porter && t < this.porter.t0 + this.porter.duration ? this.porter : null;
    for (const [seat, a] of this.actors) {
      const p = place(seat, this.status, t, porterClip, reduced);
      a.cat.visible = p.visible;
      a.cat.position.set(p.x, p.bob, p.z);
      a.cat.rotation.y = p.yaw;
      a.cat.pose(p.pose, p.phase);
      if (a.envelope) a.envelope.visible = p.carrying;
      const b = this.burns.get(seat);
      const waiting = this.status === 'waiting_at_door';
      a.cat.burn(b && !waiting ? b.amp * Math.exp((-3 * (t - b.t0)) / tickS) : 0);
    }
    // L4: Scout's lantern, cyan, during STATE_SYNC only.
    const sk = (t - this.sync) / SYNC_SECONDS;
    const sync = sk >= 0 && sk < 1 ? Math.sin(Math.PI * sk) : 0;
    const scout = this.actors.get('Scout')!;
    if (scout.lantern) (scout.lantern.material as THREE.MeshLambertMaterial).emissiveIntensity = sync * 1.5;
    const presence = this.lights.update(t, sync, scout.cat.position);
    // L2 and L3: the desk lamp's shade and the Door frame glow with the person's presence.
    this.fx.deskShade.emissiveIntensity = presence * 1.2;
    this.fx.doorFrame.emissiveIntensity = presence * 0.9;
    // The Door swings 70° about its north jamb on APPROVED, and swings back when the Porter is through.
    const dk = (t - this.door.t0) / 0.6;
    const open = dk < 0 ? 0 : dk < 0.5 ? dk / 0.5 : dk < 1.2 ? 1 : Math.max(0, 1 - (dk - 1.2) / 0.6);
    this.fx.doorPivot.rotation.y = DOOR_SWING * (reduced ? (open > 0 ? 1 : 0) : ease(open));
    // SEAT_FAILED: Scout's stool tips 15° and rights itself.
    const tk = (t - this.tip) / 0.4;
    this.fx.stool.rotation.z = tk >= 0 && tk < 1 ? ((15 * Math.PI) / 180) * Math.sin(Math.PI * tk) : 0;
  }

  dispose(): void {
    this.ctx?.scene.remove(this.group);
    this.group.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
  }
}

const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
const isSeat = (s: string): s is SeatName => (SEATS as readonly string[]).includes(s);
