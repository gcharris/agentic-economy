// The prism: 16 triangles, 48 indices, no bottom; every triangle wound outward (backface culling stays on).

import * as THREE from 'three';
import { expect, test } from 'vitest';
import { hexPrism } from '../../src/engine/gpu/hexGeometry.ts';

test('48 indices, and every face winds toward its normal', () => {
  const g = hexPrism();
  const idx = g.getIndex()!.array;
  expect(idx.length).toBe(48);
  const p = g.getAttribute('position'), n = g.getAttribute('normal');
  const v = (i: number) => new THREE.Vector3().fromBufferAttribute(p, i);
  for (let t = 0; t < 48; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
    const face = v(b).sub(v(a)).cross(v(c).sub(v(a)));
    expect(face.dot(new THREE.Vector3().fromBufferAttribute(n, a)), `triangle ${t / 3}`).toBeGreaterThan(0);
  }
});
