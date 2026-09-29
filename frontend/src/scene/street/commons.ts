// A street plate carries its own life (DESIGN §2c.1.3): the commons (turf tinted with the street's dye: the plate
// shader), the kerb ring inside the rim with lantern posts between the houses, a path from each house's Letter Slot
// to a centre stone where couriers meet and swaps settle, and five to nine low-poly trees placed by seed.
// Street lanterns are the street's status made physical: --gold-2 at rest, --ember while any house on it is halted
// (a state read each tick), off when packed.

import * as THREE from 'three';
import { seedOf, type Plate } from '../../engine/layout/layoutBulbs.ts';

const flat = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const KERB = flat('#4c3f30', { side: THREE.DoubleSide });
const PATH = flat('#c8b89a');
const STONE = flat('#8f8068');
const BRASS = flat('#a8842e', { emissive: '#a8842e', emissiveIntensity: 0.2 });
const TRUNK = flat('#5a422f');
const CANOPY = [flat('#5d6b3a'), flat('#6f7d45'), flat('#b0802c')]; // moss, a lighter moss, ochre
export const KERB_WIDTH = 1.0;
export const CENTRE_STONE_R = 2.2;

const angleOf = (h: Plate, s: Plate) => Math.atan2(h.cz - s.cz, h.cx - s.cx);

/** A deterministic sequence per street (no Math.random: a take is re-shot frame for frame). */
function seq(seed: number): () => number {
  let x = Math.floor(seed * 4294967296) >>> 0 || 1;
  return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296);
}

export interface Commons { group: THREE.Group; posts: { street: number; index: number }[] }

/** Where the lantern posts stand: on the kerb ring, midway between neighbouring houses. */
export function postAngles(street: Plate, houses: readonly Plate[]): number[] {
  const t = houses.map((h) => angleOf(h, street)).sort((a, b) => a - b);
  if (t.length === 0) return [];
  return t.map((a, i) => { const b = i + 1 < t.length ? t[i + 1] : t[0] + 2 * Math.PI; return (a + b) / 2; });
}

export function buildCommons(street: Plate, houses: readonly Plate[], lanterns: THREE.InstancedMesh, firstPost: number): Commons {
  const g = new THREE.Group();
  g.name = `commons-${street.id}`;
  g.position.set(street.cx, street.top, street.cz);
  const R = street.r;
  // The kerb ring inside the rim.
  const kerb = new THREE.Mesh(new THREE.RingGeometry(R - 1.6 - KERB_WIDTH, R - 1.6, 96).rotateX(-Math.PI / 2), KERB);
  kerb.position.y = 0.02;
  kerb.receiveShadow = true;
  g.add(kerb);
  // A path from each house's Letter Slot to the centre stone.
  for (const h of houses) {
    const a = angleOf(h, street);
    const len = R - CENTRE_STONE_R + 0.4;
    const path = new THREE.Mesh(new THREE.BoxGeometry(len, 0.03, 1.1), PATH);
    const mid = CENTRE_STONE_R + len / 2 - 0.2;
    path.position.set(Math.cos(a) * mid, 0.03, Math.sin(a) * mid);
    path.rotation.y = -a;
    path.receiveShadow = true;
    g.add(path);
  }
  // The centre stone, where couriers meet and swaps settle: a stone disc with a brass ring inlaid.
  const stone = new THREE.Mesh(new THREE.CylinderGeometry(CENTRE_STONE_R, CENTRE_STONE_R + 0.15, 0.18, 24), STONE);
  stone.position.y = 0.09;
  stone.receiveShadow = stone.castShadow = true;
  const inlay = new THREE.Mesh(new THREE.TorusGeometry(CENTRE_STONE_R - 0.4, 0.06, 4, 32).rotateX(Math.PI / 2), BRASS);
  inlay.position.y = 0.19;
  g.add(stone, inlay);
  // Five to nine trees by seed, in the commons between the paths.
  const rnd = seq(street.seed);
  const houseAngles = houses.map((h) => angleOf(h, street));
  const count = 5 + Math.floor(rnd() * 5);
  let placed = 0;
  for (let tries = 0; placed < count && tries < 60; tries++) {
    const a = rnd() * Math.PI * 2;
    const rr = CENTRE_STONE_R + 2 + rnd() * (R - CENTRE_STONE_R - 5.5);
    const clearOfPaths = houseAngles.every((h) => Math.abs(Math.sin(a - h)) * rr > 1.6 || Math.cos(a - h) < 0);
    if (!clearOfPaths) continue;
    const size = 0.8 + rnd() * 0.7;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * size, 0.16 * size, 1.2 * size, 5), TRUNK);
    trunk.position.set(Math.cos(a) * rr, 0.6 * size, Math.sin(a) * rr);
    const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95 * size, 0), CANOPY[Math.floor(rnd() * CANOPY.length)]);
    canopy.position.set(trunk.position.x, 1.55 * size, trunk.position.z);
    trunk.castShadow = canopy.castShadow = true;
    g.add(trunk, canopy);
    placed++;
  }
  // Lantern posts on the kerb ring between houses (instances in a shared mesh, coloured from state).
  const posts: { street: number; index: number }[] = [];
  const m = new THREE.Matrix4();
  postAngles(street, houses).forEach((a, i) => {
    const rr = R - 1.6 - KERB_WIDTH / 2;
    m.makeTranslation(street.cx + Math.cos(a) * rr, street.top, street.cz + Math.sin(a) * rr);
    lanterns.setMatrixAt(firstPost + i, m);
    posts.push({ street: street.id, index: firstPost + i });
  });
  return { group: g, posts };
}

/** A lantern post: a dark post with a lit head (the head's colour is the instance colour). */
export function lanternMesh(capacity: number): THREE.InstancedMesh {
  const post = new THREE.BoxGeometry(0.18, 2.2, 0.18).translate(0, 1.1, 0);
  const head = new THREE.BoxGeometry(0.42, 0.42, 0.42).translate(0, 2.35, 0);
  const geo = new THREE.BufferGeometry();
  const merge = [post, head].map((gm) => gm.toNonIndexed());
  const pos = [...merge[0].getAttribute('position').array, ...merge[1].getAttribute('position').array];
  const nrm = [...merge[0].getAttribute('normal').array, ...merge[1].getAttribute('normal').array];
  // Vertex colour: the post near-black, the head white (tinted by the instance colour).
  const col = [...new Array(merge[0].getAttribute('position').count).fill([0.12, 0.1, 0.08]).flat(), ...new Array(merge[1].getAttribute('position').count).fill([1, 1, 1]).flat()];
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#3a2a10', emissiveIntensity: 1 }), Math.max(1, capacity));
  mesh.count = 0;
  mesh.name = 'street-lanterns';
  return mesh;
}

/** Couriers meet at the centre stone; each pair of houses takes its own spot round the stone so carts don't stack. */
export function meetingStone(street: Plate, a: Plate, b: Plate): THREE.Vector3 {
  const k = seedOf(Math.min(a.id, b.id) + Math.max(a.id, b.id));
  const ang = k * Math.PI * 2;
  return new THREE.Vector3(street.cx + Math.cos(ang) * (CENTRE_STONE_R + 0.6), street.top + 0.2, street.cz + Math.sin(ang) * (CENTRE_STONE_R + 0.6));
}
