// The hex prism (ARCHITECTURE §6.1, §11): a pointy-top hexagon of HEX_SIZE, top cap (4 triangles) and six sides
// (12 triangles): 16 triangles, 48 indices, no bottom. Unit height from y 0 to 1; instances scale y.
// `uvC` is tile-local and centred ([−0.5, 0.5] across the flat-to-flat), `side` is 0 on the cap and 1 on the walls.

import * as THREE from 'three';
import { HEX_FLAT, HEX_SIZE } from '../layout/hex.ts';

export { HEX_FLAT, HEX_SIZE };

export function hexPrism(size = HEX_SIZE): THREE.BufferGeometry {
  // Corners at angles 90° + k·60° (pointy-top: a corner at ±z, matching toWorld's axial layout).
  const corner = (k: number) => { const a = Math.PI / 2 + (k * Math.PI) / 3; return [size * Math.cos(a), size * Math.sin(a)] as const; };
  const pos: number[] = [], uv: number[] = [], side: number[] = [], nrm: number[] = [];
  const idx: number[] = [];
  // Cap: six vertices, fan of four triangles.
  for (let k = 0; k < 6; k++) { const [x, z] = corner(k); pos.push(x, 1, z); uv.push(x / HEX_FLAT, z / HEX_FLAT); side.push(0); nrm.push(0, 1, 0); }
  idx.push(0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 5, 4);
  // Sides: four vertices per face (flat normals), two triangles each.
  for (let k = 0; k < 6; k++) {
    const [x0, z0] = corner(k), [x1, z1] = corner((k + 1) % 6);
    const n = new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2).normalize();
    const b = pos.length / 3;
    for (const [x, y, z] of [[x0, 1, z0], [x1, 1, z1], [x1, 0, z1], [x0, 0, z0]]) {
      pos.push(x, y, z); uv.push(x / HEX_FLAT, z / HEX_FLAT); side.push(1); nrm.push(n.x, n.y, n.z);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uvC', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('side', new THREE.Float32BufferAttribute(side, 1));
  g.setIndex(idx);
  return g;
}
