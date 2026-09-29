// The world (Stage 5, DESIGN §2c, §8): a globe on a brass stand. The sphere (R 6,000, #141d24, its graticule and limb
// stroked #385b66) with the --brass armillary ring at R + 300 tilted 23°; the countries as --panel plates tangent to
// the sphere by ascending id on the 30° N circle, each with a --gold pin and its lantern beacon; fibre as great-circle
// ribbons in #4c3f30 between country centres with a 20 % --cyan core.
//
// GLOBAL_STATE_CONFIRMED is the STARK heartbeat: a --cyan meridian sweeps once round the globe, and a cyan comet
// once round the ring, over latency_ticks × tick seconds (the clip); the HUD lands a cyan tab on the ticker.
// AWAITING_FINALITY orbits the envelope at R + 150 round its beacon until until_tick (one per envelope: the held
// list is the source, the event gives until_tick). A partitioned country goes dark, lantern and fibre cores off, until
// a later heartbeat omits it.
// The globe (DESIGN §10, 4 → 5, [4.35, 4.65]): the relief fades onto the sphere through the fog veil; the swap is at
// the veil's peak, where the veil is thickest.

import * as THREE from 'three';
import type { SceneBand, SceneContext, SceneEvent } from '../../app/App.ts';
import type { EnvelopeId, NodeId } from '../../engine/contract/state.ts';
import type { Frame } from '../../engine/source/EngineSource.ts';
import { globeWeight, weight } from '../camera/Dissolve.ts';
import { fibreLift, GLOBE_R, globeFrame, greatCircle, ORBIT_R, RING_R, RING_TILT, rootOf, type GlobeFrame } from './globe.ts';

const GROUND = new THREE.Color('#0a0806');
const CYAN = '#2aa5b8';
const PLATE_R = 620;
const ORBIT_PERIOD = 3.2; // seconds per turn round the beacon

interface BeaconMesh { id: NodeId; group: THREE.Group; lantern: THREE.MeshLambertMaterial; halo: THREE.Mesh }
interface Fibre { a: NodeId; b: NodeId; ribbon: THREE.Mesh; core: THREE.Mesh }
interface Orbit { envelope: EnvelopeId; country: NodeId; t0: number; until: number; card: THREE.Mesh }

export class WorldBand implements SceneBand {
  readonly stage = 5 as const;
  readonly group = new THREE.Group();
  frame: GlobeFrame | null = null;
  /** The last heartbeat: its start and length (the clip), its tick, and whom it left partitioned. */
  heartbeat: { t0: number; duration: number; tick: number; latency: number } | null = null;
  partitioned = new Set<NodeId>();
  readonly orbits = new Map<EnvelopeId, Orbit>();
  readonly beacons: BeaconMesh[] = [];
  readonly fibres: Fibre[] = [];
  meridian: THREE.Mesh | null = null;
  comet: THREE.Mesh | null = null;
  private ctx!: SceneContext;
  private key = '';
  private readonly until = new Map<EnvelopeId, number>();
  private globe = new THREE.Group();
  private ringGroup = new THREE.Group();
  private background: THREE.Color | null = null;
  /** A beacon's scale as the globe comes in: the focused country's own extent, so its relief becomes its plate in place. */
  private born = 1;
  private readonly cardMat = new THREE.MeshBasicMaterial({ color: '#f0e6d2', side: THREE.DoubleSide });

  mount(ctx: SceneContext): void {
    this.ctx = ctx;
    this.group.name = 'band-5';
    this.group.visible = false;
    ctx.scene.add(this.group);
  }

  private rebuild(focusRoot: NodeId | null): void {
    const layout = this.ctx.store.layout.current;
    this.group.clear();
    this.beacons.length = 0;
    this.fibres.length = 0;
    for (const o of this.orbits.values()) o.card.removeFromParent();
    this.orbits.clear();
    this.frame = globeFrame(layout, focusRoot);
    const tree = layout.trees.find((t) => t.id === focusRoot) ?? layout.trees[0];
    this.born = Math.min(1, (tree?.extent ?? PLATE_R) / PLATE_R);
    if (!this.frame) return;
    const g = this.frame;
    const brass = new THREE.MeshLambertMaterial({ color: '#a8842e', emissive: '#a8842e', emissiveIntensity: 0.2 });

    // The sphere, its graticule every 30° and its limb stroke (a back-face hull), in the globe's own frame.
    this.globe = new THREE.Group();
    this.globe.position.copy(g.centre);
    this.globe.quaternion.copy(g.quat);
    this.globe.add(new THREE.Mesh(new THREE.SphereGeometry(GLOBE_R, 96, 64), new THREE.MeshLambertMaterial({ color: '#141d24' })));
    const hull = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_R * 1.012, 96, 64), new THREE.MeshBasicMaterial({ color: '#385b66', side: THREE.BackSide }));
    this.globe.add(hull);
    const grat: number[] = [];
    const push = (p: THREE.Vector3, q: THREE.Vector3) => grat.push(p.x, p.y, p.z, q.x, q.y, q.z);
    const rr = GLOBE_R + 8;
    for (let lon = 0; lon < 12; lon++) { // meridians
      const l = (lon * Math.PI) / 6;
      for (let i = 0; i < 48; i++) {
        const a0 = -Math.PI / 2 + (Math.PI * i) / 48, a1 = -Math.PI / 2 + (Math.PI * (i + 1)) / 48;
        const at = (a: number) => new THREE.Vector3(Math.cos(a) * Math.cos(l), Math.sin(a), Math.cos(a) * Math.sin(l)).multiplyScalar(rr);
        push(at(a0), at(a1));
      }
    }
    for (const lat of [-60, -30, 0, 30, 60]) { // parallels
      const a = (lat * Math.PI) / 180;
      for (let i = 0; i < 96; i++) {
        const at = (k: number) => new THREE.Vector3(Math.cos(a) * Math.cos((2 * Math.PI * k) / 96), Math.sin(a), Math.cos(a) * Math.sin((2 * Math.PI * k) / 96)).multiplyScalar(rr);
        push(at(i), at(i + 1));
      }
    }
    const gratGeom = new THREE.BufferGeometry();
    gratGeom.setAttribute('position', new THREE.Float32BufferAttribute(grat, 3));
    this.globe.add(new THREE.LineSegments(gratGeom, new THREE.LineBasicMaterial({ color: '#385b66', transparent: true, opacity: 0.55 })));

    // The heartbeat's meridian: a great circle through the poles, turned about the pole axis as the sweep runs.
    this.meridian = new THREE.Mesh(new THREE.TorusGeometry(GLOBE_R + 40, 34, 6, 256), new THREE.MeshBasicMaterial({ color: CYAN }));
    this.meridian.visible = false;
    this.globe.add(this.meridian);

    // The armillary ring, tilted 23° to the equator, and the cyan comet that runs once round it with the sweep.
    this.ringGroup = new THREE.Group();
    this.ringGroup.rotation.set(RING_TILT, 0, 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(RING_R, 55, 8, 256).rotateX(Math.PI / 2), brass);
    this.comet = new THREE.Mesh(new THREE.TorusGeometry(RING_R, 80, 8, 48, Math.PI / 5).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: CYAN }));
    this.comet.visible = false;
    this.ringGroup.add(ring, this.comet);
    this.globe.add(this.ringGroup);
    this.group.add(this.globe);

    // The brass stand: a column from under the south of the sphere to a round foot (upright; the globe leans in it).
    const stand = new THREE.Group();
    const col = new THREE.Mesh(new THREE.CylinderGeometry(180, 260, 1300, 24), brass);
    col.position.y = -GLOBE_R - 450;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(1300, 1450, 160, 64), brass);
    foot.position.y = -GLOBE_R - 1150;
    stand.add(col, foot);
    stand.position.copy(g.centre);
    this.group.add(stand);

    // The countries: a --panel plate tangent to the sphere, a --gold pin, the lantern beacon and its halo.
    const up = new THREE.Vector3(0, 1, 0);
    for (const b of g.beacons) {
      const at = new THREE.Group();
      at.position.copy(b.pos);
      at.quaternion.setFromUnitVectors(up, b.normal);
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(PLATE_R, PLATE_R * 1.04, 70, 48), new THREE.MeshLambertMaterial({ color: '#1e1710', emissive: '#1e1710', emissiveIntensity: 0.6 }));
      plate.position.y = 20;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(PLATE_R, 22, 6, 96).rotateX(Math.PI / 2), brass);
      rim.position.y = 56;
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(34, 34, 760, 10), new THREE.MeshLambertMaterial({ color: '#d4a755', emissive: '#d4a755', emissiveIntensity: 0.35 }));
      pin.position.y = 440;
      const lantern = new THREE.MeshLambertMaterial({ color: '#f2cb7a', emissive: '#f2cb7a', emissiveIntensity: 1.0 });
      const head = new THREE.Mesh(new THREE.SphereGeometry(120, 16, 12), lantern);
      head.position.y = 880;
      const halo = new THREE.Mesh(new THREE.SphereGeometry(280, 20, 14), new THREE.MeshBasicMaterial({ color: '#f2cb7a', transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.position.y = 880;
      at.add(plate, rim, pin, head, halo);
      at.name = `beacon-${b.id}`;
      this.group.add(at);
      this.beacons.push({ id: b.id, group: at, lantern, halo });
    }

    // Fibre: great-circle ribbons between country centres (every pair up to six countries, else neighbours).
    const n = g.beacons.length;
    const pairs: [number, number][] = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (n <= 6 || j === i + 1 || (i === 0 && j === n - 1)) pairs.push([i, j]);
    const toLocal = g.quat.clone().invert();
    for (const [i, j] of pairs) {
      const a = g.beacons[i].normal.clone().applyQuaternion(toLocal), b = g.beacons[j].normal.clone().applyQuaternion(toLocal);
      const ribbon = new THREE.Mesh(ribbonGeometry(a, b, 0, 240), new THREE.MeshLambertMaterial({ color: '#4c3f30', emissive: '#4c3f30', emissiveIntensity: 0.4, side: THREE.DoubleSide }));
      const core = new THREE.Mesh(ribbonGeometry(a, b, 8, 48), new THREE.MeshBasicMaterial({ color: CYAN, side: THREE.DoubleSide }));
      this.globe.add(ribbon, core);
      this.fibres.push({ a: g.beacons[i].id, b: g.beacons[j].id, ribbon, core });
    }
    this.applyPartition();
  }

  onFrame(frame: Frame): void {
    const { store } = this.ctx;
    const layout = store.layout.current;
    const focusRoot = rootOf(layout, store.focus);
    const key = `${store.layout.key}|${focusRoot}`;
    if (key !== this.key) { this.key = key; this.rebuild(focusRoot); }
    for (const ev of frame.events) if (ev.type === 'AWAITING_FINALITY' && !this.until.has(ev.envelope)) this.until.set(ev.envelope, ev.until_tick);
    // The orbits are the held list's: an envelope awaiting finality orbits its country's beacon until it leaves.
    const live = new Set<EnvelopeId>();
    for (const h of frame.state.held) {
      if (h.reason !== 'awaiting_finality') continue;
      const country = rootOf(layout, h.node);
      if (country === null) continue;
      live.add(h.envelope);
      if (this.orbits.has(h.envelope)) continue;
      const card = new THREE.Mesh(new THREE.PlaneGeometry(300, 210), this.cardMat);
      card.name = `orbit-${h.envelope}`;
      this.group.add(card);
      this.orbits.set(h.envelope, { envelope: h.envelope, country, t0: frame.arrivedAt, until: this.until.get(h.envelope) ?? frame.tick + 8, card });
    }
    for (const [id, o] of this.orbits) if (!live.has(id) || frame.tick >= o.until) { o.card.removeFromParent(); this.orbits.delete(id); }
  }

  onEvent(se: SceneEvent): void {
    if (se.ev.type !== 'GLOBAL_STATE_CONFIRMED') return;
    // The partition is state: a seek applies it too. The sweep is motion: only a live arrival plays it.
    this.partitioned = new Set(se.ev.partitioned);
    this.applyPartition();
    if (se.seeked) return;
    const duration = se.clip?.duration ?? se.ev.latency_ticks * this.ctx.store.tickSeconds;
    this.heartbeat = { t0: se.clip?.t0 ?? se.arrivedAt, duration, tick: se.ev.tick, latency: se.ev.latency_ticks };
  }

  private applyPartition(): void {
    for (const b of this.beacons) {
      const dark = this.partitioned.has(b.id);
      b.lantern.emissiveIntensity = dark ? 0 : 1.0;
      b.lantern.color.set(dark ? '#1e1710' : '#f2cb7a');
      b.halo.visible = !dark;
    }
    for (const f of this.fibres) f.core.visible = !this.partitioned.has(f.a) && !this.partitioned.has(f.b);
  }

  /** The sweep's progress at app time t: null outside the heartbeat, else 0–1. */
  sweepAt(t: number): number | null {
    const h = this.heartbeat;
    if (!h) return null;
    const k = (t - h.t0) / Math.max(1e-3, h.duration);
    return k >= 0 && k <= 1 ? k : null;
  }

  setAltitude(a: number): void {
    const g = globeWeight(a);
    this.group.visible = g >= 0.5 && this.frame !== null;
    // The beacons grow from the country's size to their own as the camera pulls back (4.5 → 4.85).
    const grow = this.born + (1 - this.born) * weight(a, 4.5, 4.85);
    for (const b of this.beacons) b.group.scale.setScalar(grow);
    // The World's floor is #0a0806: night falls over the first half of the window, the globe comes up out of it.
    const bg = this.ctx.scene.background;
    if (bg instanceof THREE.Color) {
      if (!this.background) this.background = bg.clone();
      bg.copy(this.background).lerp(GROUND, Math.min(1, 2 * g));
    }
  }

  animate(t: number): void {
    if (!this.group.visible || !this.frame) return;
    const k = this.sweepAt(t);
    if (this.meridian && this.comet) {
      this.meridian.visible = this.comet.visible = k !== null;
      if (k !== null) {
        const phi = 2 * Math.PI * k;
        this.meridian.rotation.set(0, phi, 0);
        this.comet.rotation.set(0, -phi, 0);
      }
    }
    for (const o of this.orbits.values()) {
      const b = this.frame.beacons.find((x) => x.id === o.country);
      if (!b) { o.card.visible = false; continue; }
      const rho = PLATE_R * 1.7;
      const u = new THREE.Vector3(0, 1, 0).cross(b.normal);
      if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
      u.normalize();
      const v = b.normal.clone().cross(u);
      const w = (2 * Math.PI * (t - o.t0)) / ORBIT_PERIOD + (o.envelope % 7);
      const lift = Math.sqrt(ORBIT_R * ORBIT_R - rho * rho);
      o.card.position.copy(this.frame.centre).addScaledVector(b.normal, lift).addScaledVector(u, rho * Math.cos(w)).addScaledVector(v, rho * Math.sin(w));
      o.card.lookAt(this.ctx.camera.position);
      o.card.visible = true;
    }
  }

  dispose(): void { this.ctx?.scene.remove(this.group); }
}

/** A ribbon along the great circle from local normal a to b at radius r, `width` metres wide, lying on the sphere. */
function ribbonGeometry(a: THREE.Vector3, b: THREE.Vector3, above: number, width: number): THREE.BufferGeometry {
  // The great circle from a to b on the unit sphere, lifted off the surface by fibreLift (an arch, highest mid-span).
  const omega = Math.acos(Math.min(1, Math.max(-1, a.dot(b))));
  const pts = greatCircle(a, b, 1, 96).map((u, i) => u.multiplyScalar(GLOBE_R + above + fibreLift(i / 96, omega)));
  const pos: number[] = [], idx: number[] = [];
  pts.forEach((p, i) => {
    const next = pts[Math.min(pts.length - 1, i + 1)], prev = pts[Math.max(0, i - 1)];
    const tangent = next.clone().sub(prev).normalize();
    const side = p.clone().normalize().cross(tangent).normalize().multiplyScalar(width / 2);
    pos.push(p.x + side.x, p.y + side.y, p.z + side.z, p.x - side.x, p.y - side.y, p.z - side.z);
    if (i > 0) { const k = 2 * i; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
