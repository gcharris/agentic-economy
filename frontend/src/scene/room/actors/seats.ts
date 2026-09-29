// The five seats (DESIGN §5): fur, the one prop that names each, walk rate. Staff, not traders.

import * as THREE from 'three';
import { PegCat } from './PegCat.ts';

export type SeatName = 'Scout' | 'Scribble' | 'Inspector' | 'Penny' | 'Porter';
export const SEATS: readonly SeatName[] = ['Scout', 'Scribble', 'Inspector', 'Penny', 'Porter'];

export const FUR: Record<SeatName, string> = {
  Scout: '#d4913b', Scribble: '#7a624d', Inspector: '#5c5148', Penny: '#b9a88f', Porter: '#3e3b38',
};
export const STEPS_PER_S: Record<SeatName, number> = { Scout: 2.6, Scribble: 1.0, Inspector: 1.4, Penny: 3.0, Porter: 2.0 };

const flat = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const BRASS = flat('#a8842e');
const INK = flat('#1c150e');
const OAK = flat('#5a422f');

export interface SeatActor {
  seat: SeatName;
  cat: PegCat;
  /** Scout's lantern (cyan during STATE_SYNC only), the Porter's envelope; null for the others. */
  lantern: THREE.Mesh | null;
  envelope: THREE.Mesh | null;
}

export function makeSeat(seat: SeatName): SeatActor {
  const cat = new PegCat(FUR[seat]);
  cat.name = seat;
  let lantern: THREE.Mesh | null = null;
  let envelope: THREE.Mesh | null = null;
  const add = (m: THREE.Object3D) => { cat.body.add(m); return m; };
  switch (seat) {
    case 'Scout': {
      add(new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 4, 8), INK)).position.set(-0.045, 0.72, 0.16);
      add(new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 4, 8), INK)).position.set(0.045, 0.72, 0.16);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.06), flat('#5a422f'))).position.set(0.17, 0.32, -0.02); // satchel
      lantern = add(new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0),
        new THREE.MeshLambertMaterial({ color: '#3e3a34', emissive: '#2aa5b8', emissiveIntensity: 0, flatShading: true }))) as THREE.Mesh;
      lantern.position.set(-0.22, 0.42, 0.08);
      break;
    }
    case 'Scribble': {
      const quill = add(new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.55, 4), flat('#e9dfc6')));
      quill.position.set(0.18, 0.62, 0.12); quill.rotation.z = -0.35;
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.06, 6), INK)).position.set(0.24, 0.03, 0.18);
      break;
    }
    case 'Inspector': {
      const stick = add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), OAK));
      stick.position.set(0.2, 0.55, 0.12);
      add(new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 4, 10), BRASS)).position.set(0.2, 0.74, 0.12);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.08, 6), flat('#6a9a6e'))).position.set(-0.19, 0.36, 0.1); // stamp
      break;
    }
    case 'Penny': {
      const broom = add(new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.8, 4), OAK));
      broom.position.set(0.2, 0.42, 0.1); broom.rotation.z = 0.6;
      add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.12), BRASS)).position.set(-0.18, 0.3, 0.12); // scoop
      break;
    }
    case 'Porter': {
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.05, 8), flat('#2c2219'))).position.set(0, 0.83, 0.04); // flat cap
      envelope = add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.006),
        new THREE.MeshLambertMaterial({ color: '#f0e6d2', emissive: '#f0e6d2', emissiveIntensity: 0.9 }))) as THREE.Mesh;
      envelope.position.set(0, 0.46, 0.26); envelope.rotation.x = -0.25; // held out, leading
      break;
    }
  }
  return { seat, cat, lantern, envelope };
}
