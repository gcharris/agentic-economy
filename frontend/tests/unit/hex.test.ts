import { describe, expect, test } from 'vitest';
import { cellKey, corners, distance, fromCellKey, fromWorld, HEX_FLAT, HEX_SIZE, ring, spiral, toWorld, type Axial } from '../../src/engine/layout/hex.ts';

const O: Axial = { q: 0, r: 0 };

describe('hex.ts (axial, pointy-top)', () => {
  test('ring(k) has 6k cells, all at distance k, and ring(0) is the centre', () => {
    expect(ring(O, 0)).toEqual([O]);
    for (let k = 1; k <= 8; k++) {
      const cells = ring(O, k);
      expect(cells).toHaveLength(6 * k);
      for (const c of cells) expect(distance(O, c)).toBe(k);
      expect(new Set(cells.map(cellKey)).size).toBe(6 * k);
    }
  });

  test('ring starts at center + DIRS[4]·k and walks DIRS[0..5]', () => {
    expect(ring(O, 2)[0]).toEqual({ q: -2, r: 2 });
    expect(ring(O, 1)).toEqual([{ q: -1, r: 1 }, { q: 0, r: 1 }, { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }, { q: -1, r: 0 }]);
  });

  test('distance is symmetric, zero on the diagonal, and obeys the triangle inequality', () => {
    const cells = spiral(O, 4);
    for (const a of cells) for (const b of cells) {
      expect(distance(a, b)).toBe(distance(b, a));
      expect(distance(a, a)).toBe(0);
      for (const c of cells.slice(0, 7)) expect(distance(a, c)).toBeLessThanOrEqual(distance(a, b) + distance(b, c));
    }
  });

  test('spiral(3) is 37 unique cells, centre first', () => {
    const s = spiral(O, 3);
    expect(s).toHaveLength(37);
    expect(s[0]).toEqual(O);
    expect(new Set(s.map(cellKey)).size).toBe(37);
  });

  test('corners(3) = [0, 3, 6, 9, 12, 15]', () => {
    expect(corners(3)).toEqual([0, 3, 6, 9, 12, 15]);
    expect(corners(1)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test('toWorld: HEX_SIZE 6, flat-to-flat √3·6, neighbours one flat apart', () => {
    expect(HEX_SIZE).toBe(6);
    expect(HEX_FLAT).toBeCloseTo(10.392, 3);
    const a = toWorld(O), b = toWorld({ q: 1, r: 0 });
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(HEX_FLAT, 6);
    expect(toWorld({ q: 0, r: 2 }).z).toBeCloseTo(18, 6);
  });

  test('fromWorld inverts toWorld on a spiral, and cellKey round-trips', () => {
    for (const c of spiral(O, 6)) {
      const w = toWorld(c);
      expect(fromWorld(w.x + 0.3, w.z - 0.2)).toEqual(c);
      expect(fromCellKey(cellKey(c))).toEqual(c);
    }
  });
});
