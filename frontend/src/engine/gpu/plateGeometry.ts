// The plate (DESIGN §2c.1, ARCHITECTURE §7.3): a unit disc fan with a bevel ring and a wall, no bottom. Instances
// place and size it from aCenter / aRadius; the vertex shader displaces the rim by fog. Per vertex: `ang` (θ around
// the plate), `rho` (0 at the centre, 0.9 at the bevel's inner edge, 1 at the rim), `side` (0 cap, 1 bevel or wall).
// Top at y = 1 (instances scale y to the plate's height).

import * as THREE from 'three';

export const PLATE_SEGMENTS = 96; // §7.3 says 48; 96 keeps the 27-cycle octave of the coastline from aliasing
const BEVEL_IN = 0.9, BEVEL_Y = 0.8;

export function plateGeometry(n = PLATE_SEGMENTS): THREE.BufferGeometry {
  const pos: number[] = [], nrm: number[] = [], ang: number[] = [], rho: number[] = [], side: number[] = [], idx: number[] = [];
  const v = (x: number, y: number, z: number, nx: number, ny: number, nz: number, a: number, r: number, s: number) => {
    pos.push(x, y, z); nrm.push(nx, ny, nz); ang.push(a); rho.push(r); side.push(s); return pos.length / 3 - 1;
  };
  const c = v(0, 1, 0, 0, 1, 0, 0, 0, 0);
  const capRing: number[] = [], bevTop: number[] = [], bevBot: number[] = [], wallTop: number[] = [], wallBot: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2, x = Math.cos(a), z = Math.sin(a);
    capRing.push(v(BEVEL_IN * x, 1, BEVEL_IN * z, 0, 1, 0, a, BEVEL_IN, 0));
    const bn = new THREE.Vector3(x * 0.2, 0.1, z * 0.2).normalize();
    bevTop.push(v(BEVEL_IN * x, 1, BEVEL_IN * z, bn.x, bn.y, bn.z, a, BEVEL_IN, 1));
    bevBot.push(v(x, BEVEL_Y, z, bn.x, bn.y, bn.z, a, 1, 1));
    wallTop.push(v(x, BEVEL_Y, z, x, 0, z, a, 1, 1));
    wallBot.push(v(x, 0, z, x, 0, z, a, 1, 1));
  }
  for (let i = 0; i < n; i++) {
    idx.push(c, capRing[i + 1], capRing[i]);                                               // the cap fan
    idx.push(bevTop[i], bevTop[i + 1], bevBot[i + 1], bevTop[i], bevBot[i + 1], bevBot[i]); // the bevel
    idx.push(wallTop[i], wallTop[i + 1], wallBot[i + 1], wallTop[i], wallBot[i + 1], wallBot[i]); // the wall
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('ang', new THREE.Float32BufferAttribute(ang, 1));
  g.setAttribute('rho', new THREE.Float32BufferAttribute(rho, 1));
  g.setAttribute('side', new THREE.Float32BufferAttribute(side, 1));
  // The shader reads one packed vec4 per vertex (WebGL caps a program at 16 attribute slots): angle, rho, y, part
  // (0 cap, 1 bevel, 2 wall); it derives the normal from these.
  const vtx: number[] = [];
  for (let i = 0; i < ang.length; i++) { const y = pos[i * 3 + 1]; vtx.push(ang[i], rho[i], y, side[i] === 0 ? 0 : nrm[i * 3 + 1] === 0 ? 2 : 1); }
  g.setAttribute('vtx', new THREE.Float32BufferAttribute(vtx, 4));
  g.setIndex(idx);
  return g;
}
