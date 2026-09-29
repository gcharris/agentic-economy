// The plate: a fan, a bevel and a wall, no bottom; every triangle wound outward (backface culling stays on).

import * as THREE from 'three';
import { expect, test } from 'vitest';
import { plateGeometry } from '../../src/engine/gpu/plateGeometry.ts';

test('5n triangles, every face winding toward its normal', () => {
  const n = 24, g = plateGeometry(n);
  const idx = g.getIndex()!.array;
  expect(idx.length).toBe(3 * 5 * n);
  const p = g.getAttribute('position'), nm = g.getAttribute('normal');
  const v = (i: number) => new THREE.Vector3().fromBufferAttribute(p, i);
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
    const face = v(b).sub(v(a)).cross(v(c).sub(v(a)));
    const normal = new THREE.Vector3().fromBufferAttribute(nm, a).add(new THREE.Vector3().fromBufferAttribute(nm, b));
    expect(face.dot(normal), `triangle ${t / 3}`).toBeGreaterThan(0);
  }
});
