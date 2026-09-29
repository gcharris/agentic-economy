// Set dressing (DESIGN §7, §2b): foundries on satellite plates in the arc gaps of the city's rim (three --roof stacks, --ember
// rims at 60 %), data yards likewise (slate longhouses, lantern rows at 30 %); they carry no number and read no texel.
// The street lanterns (one per house plate, on its outward rim): --gold-2 at rest, --ember while any house on the
// street is halted, off when packed.

import * as THREE from 'three';
import { PLATE_TOP, rimPoint, type Plate, type Satellite } from '../../engine/layout/layoutBulbs.ts';

const SAT_TOP = 0.25; // the satellite plates' top (TileMesh)

const flat = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

/** Scaled to its satellite plate (the kit is drawn for a 6 m plate). */
function onSatellite(s: Satellite): THREE.Group {
  const g = new THREE.Group();
  g.position.set(s.cx, SAT_TOP, s.cz);
  g.scale.setScalar(s.r / 6);
  g.rotation.y = -s.theta;
  return g;
}

export function buildFoundry(s: Satellite): THREE.Group {
  const g = onSatellite(s);
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

export function buildYard(s: Satellite): THREE.Group {
  const g = onSatellite(s);
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

/** One lantern post per house plate, on its rim at the outward side (away from its street). */
export function buildLanterns(houses: readonly Plate[]): THREE.InstancedMesh {
  const post = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 1.6, 0.3).translate(0, 0.8, 0),
    new THREE.MeshLambertMaterial({ color: '#3e3a34', emissive: '#ffffff', emissiveIntensity: 0.9 }), Math.max(1, houses.length));
  const m = new THREE.Matrix4();
  houses.forEach((h, i) => {
    const p = rimPoint(h, h.theta, 0.82);
    m.makeTranslation(p.x, PLATE_TOP.House, p.z);
    post.setMatrixAt(i, m);
    post.setColorAt(i, new THREE.Color('#b98626'));
  });
  post.count = houses.length;
  post.name = 'street-lanterns';
  return post;
}
