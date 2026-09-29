// Set dressing (DESIGN §7, §2b): foundries on satellite plates in the arc gaps of the city's rim (three --roof stacks, --ember
// rims at 60 %), data yards likewise (slate longhouses, lantern rows at 30 %); they carry no number and read no texel.
// Trees along the tubes. (The street lanterns are the commons' posts: street/commons.ts.)

import * as THREE from 'three';
import type { Satellite } from '../../engine/layout/layoutBulbs.ts';

const flat = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

/** Scaled to its satellite plate (the kit is drawn for a 6 m plate). */
function onSatellite(s: Satellite, top: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(s.cx, top, s.cz);
  g.scale.setScalar(s.r / 6);
  g.rotation.y = -s.theta;
  return g;
}

/** `top`: the city plate's top: foundries and yards stand on the plate between the streets (§2c.1.3). */
export function buildFoundry(s: Satellite, top: number): THREE.Group {
  const g = onSatellite(s, top);
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

export function buildYard(s: Satellite, top: number): THREE.Group {
  const g = onSatellite(s, top);
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

const TRUNK = flat('#5a422f'), LEAF = [flat('#5d6b3a'), flat('#6f7d45')];
/** Trees along a tube (§2c.1.3): pairs every ~7 m either side, from the street end toward the dome's paving. */
export function buildTubeTrees(from: { x: number; z: number }, to: { x: number; z: number }, top: number, stopShort: number): THREE.Group {
  const g = new THREE.Group();
  const dx = to.x - from.x, dz = to.z - from.z, len = Math.hypot(dx, dz);
  const ux = dx / len, uz = dz / len;
  for (let d = 4; d < len - stopShort; d += 7) {
    for (const side of [-1, 1]) {
      const x = from.x + ux * d - uz * side * 2.6, z = from.z + uz * d + ux * side * 2.6;
      const k = 0.9 + 0.3 * Math.abs(Math.sin(d * 1.7 + side));
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * k, 0.18 * k, 1.3 * k, 5), TRUNK);
      trunk.position.set(x, top + 0.65 * k, z);
      const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0 * k, 0), LEAF[(d / 7 + (side > 0 ? 1 : 0)) % 2 | 0]);
      canopy.position.set(x, top + 1.7 * k, z);
      trunk.castShadow = canopy.castShadow = true;
      g.add(trunk, canopy);
    }
  }
  return g;
}
