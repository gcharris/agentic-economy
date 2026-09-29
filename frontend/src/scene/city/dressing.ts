// Set dressing (DESIGN §7, §2b): foundries on the corner cells of ring radius + 1 (three --roof stacks, --ember rims at
// 60 %, a slow plume), data yards on the corners of ring radius + 2 (slate longhouses, lantern rows at 30 %); they carry
// no number and read no texel. The street lanterns (one per house tile, on its outer edge): --gold-2 at rest, --ember
// while any house on the street is halted, off when packed. The bevelled --oak baseboard round the spiral's edge.

import * as THREE from 'three';
import { HEX_FLAT, HEX_SIZE, toWorld, type Axial } from '../../engine/layout/hex.ts';
import { HEIGHT } from '../../engine/gpu/TileMesh.ts';

const flat = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

export function buildFoundry(c: Axial): THREE.Group {
  const g = new THREE.Group();
  const w = toWorld(c);
  g.position.set(w.x, HEIGHT.ground, w.z);
  const shed = new THREE.Mesh(new THREE.BoxGeometry(6, 1.6, 4), flat('#7d4a34'));
  shed.position.y = 0.8;
  g.add(shed);
  for (const [x, z] of [[-1.8, -0.8], [0, 0.6], [1.8, -0.4]]) {
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 4, 8), flat('#7d4a34'));
    stack.position.set(x, 2.0, z);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.08, 4, 10).rotateX(Math.PI / 2), flat('#c95140', { emissive: '#c95140', emissiveIntensity: 0.6 }));
    rim.position.set(x, 4.0, z);
    stack.castShadow = true;
    g.add(stack, rim);
  }
  shed.castShadow = true;
  return g;
}

export function buildYard(c: Axial): THREE.Group {
  const g = new THREE.Group();
  const w = toWorld(c);
  g.position.set(w.x, HEIGHT.ground, w.z);
  for (const z of [-1.6, 1.6]) {
    const house = new THREE.Mesh(new THREE.BoxGeometry(7, 1.4, 2.2), flat('#4a4f57')); // slate
    house.position.set(0, 0.7, z);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(7.1, 0.12, 0.2), flat('#5a422f'));
    beam.position.set(0, 1.45, z);
    house.castShadow = true;
    g.add(house, beam);
    for (let i = 0; i < 5; i++) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), flat('#3e3a34', { emissive: '#f2cb7a', emissiveIntensity: 0.3 }));
      l.position.set(-2.8 + i * 1.4, 1.1, z + (z < 0 ? -1.15 : 1.15));
      g.add(l);
    }
  }
  return g;
}

/** One lantern post per house tile on its outer edge (away from the Clearinghouse). */
export function buildLanterns(cells: readonly Axial[]): THREE.InstancedMesh {
  const post = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 1.6, 0.3).translate(0, 0.8, 0),
    new THREE.MeshLambertMaterial({ color: '#3e3a34', emissive: '#ffffff', emissiveIntensity: 0.9 }), Math.max(1, cells.length));
  const m = new THREE.Matrix4();
  cells.forEach((c, i) => {
    const w = toWorld(c);
    const l = Math.hypot(w.x, w.z) || 1;
    m.makeTranslation(w.x + (w.x / l) * 4.2, HEIGHT.house, w.z + (w.z / l) * 4.2);
    post.setMatrixAt(i, m);
    post.setColorAt(i, new THREE.Color('#b98626'));
  });
  post.count = cells.length;
  post.name = 'street-lanterns';
  return post;
}

/** The bevelled --oak baseboard round the spiral's edge (ring `rings` of the ground). */
export function buildBaseboard(rings: number): THREE.Mesh {
  const r = rings * HEX_FLAT + HEX_SIZE + 1.2;
  const frame = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.8, 1.0, 6, 1, true).rotateY(Math.PI / 6), flat('#5a422f', { side: THREE.DoubleSide }));
  frame.position.y = 0.3;
  frame.receiveShadow = true;
  return frame;
}
