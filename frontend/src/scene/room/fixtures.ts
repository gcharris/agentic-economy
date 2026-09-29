// The room's fixtures (DESIGN §4), in house-local metres: x east, z south, y up, origin at the floor's centre.
// Interior 8.0 × 6.0, walls 0.10 thick and 3.2 high; the Door on the east wall at x = 4.0, z ∈ [−0.5, 0.5].
// The south and west walls are omitted at band 1: the camera stands south-west.

import * as THREE from 'three';
import { hazeMaterial, type HazeUniforms } from './haze.ts';

const flat = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

export const C = {
  floor: '#19130d', wall: '#2c2219', wall2: '#201811', oak: '#5a422f', oakDark: '#3e2d1f', oakTop: '#423021', oakLeg: '#312318',
  door: '#4a3525', brass: '#a8842e', goldLight: '#f2cb7a', gold: '#d4a755', gold2: '#b98626', ember: '#c95140', sage: '#6a9a6e',
  shelf: '#4f3926', case: '#3a2a1c', spines: ['#7a4f32', '#8b3a2b', '#3d5c48', '#a6884e'], paper: '#f0e6d2', paperAged: '#d8c8a8', plinth: '#2b2117',
} as const;

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A deterministic sequence for the spines (no Math.random: a take is re-shot frame for frame). */
function seq(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export interface Fixtures {
  group: THREE.Group;
  haze: HazeUniforms;
  doorPivot: THREE.Group;
  doorFrame: THREE.MeshLambertMaterial;
  deskShade: THREE.MeshLambertMaterial;
  tableShade: THREE.MeshLambertMaterial;
  purseArc: THREE.Mesh;
  papers: THREE.InstancedMesh;
  note: THREE.Mesh;
  /** Scout's stool, for SEAT_FAILED's 15° tip. */
  stool: THREE.Group;
}

export const PAPER_CAP = 96;
export const TABLE_TOP = 0.76;

export function buildFixtures(): Fixtures {
  const g = new THREE.Group();
  g.name = 'room-fixtures';
  const haze = hazeMaterial(C.wall, C.wall2);

  // Floor and a plinth lip, so the room sits on its tile.
  const floor = box(8.2, 0.3, 6.2, flat(C.floor), 0, -0.15, 0);
  floor.castShadow = false;
  g.add(floor);

  // North wall (the far wall, where the fog haze lives) and east wall with the Door opening.
  const wallN = new THREE.Mesh(new THREE.BoxGeometry(8.2, 3.2, 0.1), haze.material);
  wallN.position.set(0, 1.6, -3.05);
  wallN.receiveShadow = true;
  g.add(wallN);
  const east = (zc: number, depth: number, y = 1.6, h = 3.2) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, h, depth), haze.material);
    m.position.set(4.05, y, zc);
    m.receiveShadow = true;
    g.add(m);
  };
  east(-1.8, 2.6);            // z −3.1 … −0.5
  east(1.8, 2.6);             // z 0.5 … 3.1
  east(0, 1.0, 2.65, 1.1);    // over the Door: y 2.1 … 3.2
  // A skirting board, so the walls meet the floor with a line.
  g.add(box(8.2, 0.12, 0.03, flat(C.oakDark), 0, 0.06, -2.99), box(0.03, 0.12, 6.2, flat(C.oakDark), 3.99, 0.06, 0));

  // The Door: leaf 1.0 × 2.1 about its north jamb; brass frame 0.08; knob at 1.0 m; the step outside.
  const doorPivot = new THREE.Group();
  doorPivot.position.set(4.0, 0, -0.5);
  const leaf = box(0.06, 2.1, 1.0, flat(C.door), 0.03, 1.05, 0.5);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), flat(C.brass));
  knob.position.set(-0.04, 1.0, 0.85);
  doorPivot.add(leaf, knob);
  g.add(doorPivot);
  const doorFrame = new THREE.MeshLambertMaterial({ color: C.brass, emissive: C.goldLight, emissiveIntensity: 0, flatShading: true });
  g.add(box(0.14, 2.18, 0.08, doorFrame, 4.0, 1.09, -0.54), box(0.14, 2.18, 0.08, doorFrame, 4.0, 1.09, 0.54), box(0.14, 0.08, 1.16, doorFrame, 4.0, 2.14, 0));
  g.add(box(0.6, 0.1, 1.2, flat(C.oakDark), 4.4, 0.05, 0));

  // The Archives: x −3.8 … −1.6, z −3.0 … −2.5, 2.4 m tall, four shelves of spines.
  const caseMat = flat(C.case);
  g.add(box(2.2, 2.4, 0.06, caseMat, -2.7, 1.2, -2.97), box(0.06, 2.4, 0.5, caseMat, -3.77, 1.2, -2.75), box(0.06, 2.4, 0.5, caseMat, -1.63, 1.2, -2.75));
  const rnd = seq(7);
  const spineMats = C.spines.map((c) => flat(c));
  for (let s = 0; s < 4; s++) {
    const y = 0.1 + s * 0.58;
    g.add(box(2.1, 0.04, 0.46, flat(C.shelf), -2.7, y, -2.75));
    let x = -3.7;
    while (x < -1.75) {
      const w = 0.05 + rnd() * 0.05, h = 0.3 + rnd() * 0.16;
      if (rnd() > 0.12) g.add(box(w, h, 0.3, spineMats[Math.floor(rnd() * 4)], x + w / 2, y + 0.02 + h / 2, -2.78));
      x += w + 0.008;
    }
  }

  // The Oak Table: x −1.5 … 1.5, z −0.5 … 0.5, top at 0.76.
  g.add(box(3.0, 0.06, 1.0, flat(C.oakTop), 0, TABLE_TOP - 0.03, 0));
  for (const [x, z] of [[-1.4, -0.42], [1.4, -0.42], [-1.4, 0.42], [1.4, 0.42]]) g.add(box(0.08, TABLE_TOP - 0.06, 0.08, flat(C.oakLeg), x, (TABLE_TOP - 0.06) / 2, z));
  // Scribble's bench on the table's south side.
  g.add(box(2.2, 0.06, 0.3, flat(C.oak), -0.6, 0.45, 0.95), box(0.06, 0.42, 0.26, flat(C.oakLeg), -1.6, 0.21, 0.95), box(0.06, 0.42, 0.26, flat(C.oakLeg), 0.4, 0.21, 0.95));

  // The paper stack at (0.6, 0.77, 0.2): one sheet per `papers`; every third sheet (the Audit) aged.
  const papers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.004, 0.2), flat(C.paper), PAPER_CAP);
  const m4 = new THREE.Matrix4();
  const aged = new THREE.Color(C.paperAged), plain = new THREE.Color(C.paper);
  for (let i = 0; i < PAPER_CAP; i++) {
    m4.makeRotationY((rnd() - 0.5) * 0.12).setPosition(0.6 + (rnd() - 0.5) * 0.015, TABLE_TOP + 0.002 + i * 0.004, 0.2 + (rnd() - 0.5) * 0.015);
    papers.setMatrixAt(i, m4);
    papers.setColorAt(i, i % 3 === 2 ? aged : plain);
  }
  papers.count = 0;
  papers.castShadow = true;
  g.add(papers);

  // The Note (halted only) at (0.4, 0.77, −0.2).
  const note = box(0.3, 0.004, 0.22, new THREE.MeshLambertMaterial({ color: C.paper, emissive: C.paper, emissiveIntensity: 0.25 }), 0.4, TABLE_TOP + 0.004, -0.2);
  note.rotation.y = 0.2;
  note.visible = false;
  g.add(note);

  // The table lamp L1 hangs at (0.8, 2.4, 0.0).
  const tableShade = new THREE.MeshLambertMaterial({ color: C.brass, emissive: C.goldLight, emissiveIntensity: 0.6, side: THREE.DoubleSide, flatShading: true });
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.22, 8, 1, true), tableShade);
  shade.position.set(0.8, 2.5, 0);
  const cord = box(0.015, 0.7, 0.015, flat(C.oakDark), 0.8, 2.95, 0);
  cord.castShadow = false;
  g.add(shade, cord);

  // The Desk: x 2.4 … 3.8, z −2.9 … −2.2, top 0.80; the desk lamp L2 at (2.7, 1.2, −2.6); the Purse at (3.3, 0.85, −2.6).
  g.add(box(1.4, 0.05, 0.7, flat(C.oakTop), 3.1, 0.775, -2.55));
  for (const [x, z] of [[2.45, -2.25], [3.75, -2.25], [2.45, -2.85], [3.75, -2.85]]) g.add(box(0.06, 0.75, 0.06, flat(C.oakLeg), x, 0.375, z));
  const deskShade = new THREE.MeshLambertMaterial({ color: C.brass, emissive: C.goldLight, emissiveIntensity: 0, flatShading: true });
  g.add(box(0.03, 0.4, 0.03, flat(C.brass), 2.7, 1.0, -2.6));
  const dshade = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.14, 8, 1, true), deskShade);
  dshade.position.set(2.7, 1.22, -2.6);
  g.add(dshade);
  const purseBody = box(0.4, 0.25, 0.3, flat(C.oakDark), 3.3, 0.925, -2.6);
  g.add(purseBody, box(0.42, 0.03, 0.04, flat(C.brass), 3.3, 1.05, -2.46), box(0.42, 0.03, 0.04, flat(C.brass), 3.3, 1.05, -2.74));
  const purseArc = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.1, 24, 1, Math.PI / 2, -2 * Math.PI), new THREE.MeshBasicMaterial({ color: C.gold, side: THREE.DoubleSide }));
  purseArc.rotation.x = -Math.PI / 2;
  purseArc.position.set(3.3, 1.052, -2.6);
  g.add(purseArc);

  // Scout's stool at (−2.7, −1.8).
  const stool = new THREE.Group();
  stool.position.set(-2.7, 0, -1.8);
  stool.add(box(0.36, 0.04, 0.36, flat(C.oak), 0, 0.46, 0));
  for (const [x, z] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) stool.add(box(0.04, 0.44, 0.04, flat(C.oakLeg), x, 0.22, z));
  g.add(stool);

  return { group: g, haze, doorPivot, doorFrame, deskShade, tableShade, purseArc, papers, note, stool };
}

/** The Purse's lid arc: fills to compute / compute_allocated, gold-2 → gold, ember below 15 %. */
export function setPurse(arc: THREE.Mesh, share: number): void {
  const s = Math.max(0, Math.min(1, share));
  arc.geometry.dispose();
  arc.geometry = new THREE.RingGeometry(0.06, 0.1, 24, 1, Math.PI / 2, -2 * Math.PI * Math.max(0.001, s));
  const mat = arc.material as THREE.MeshBasicMaterial;
  mat.color.set(s < 0.15 ? C.ember : C.gold2).lerp(new THREE.Color(s < 0.15 ? C.ember : C.gold), s);
}
