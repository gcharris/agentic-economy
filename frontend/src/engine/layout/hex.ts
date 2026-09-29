// Axial hex math, pointy-top (ARCHITECTURE §7.1). Pure; the world unit is the metre.

export type Axial = { q: number; r: number };

export const DIRS: readonly Axial[] = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }, { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

export const add = (a: Axial, b: Axial): Axial => ({ q: a.q + b.q, r: a.r + b.r });
export const scale = (a: Axial, k: number): Axial => ({ q: a.q * k, r: a.r * k });
export const equal = (a: Axial, b: Axial): boolean => a.q === b.q && a.r === b.r;

export const distance = (a: Axial, b: Axial): number => {
  const dq = a.q - b.q, dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
};

/** 6k cells, from center + DIRS[4]·k, walking DIRS[0..5]; k = 0 is the centre alone. */
export function ring(center: Axial, k: number): Axial[] {
  if (k === 0) return [center];
  const out: Axial[] = [];
  let h = add(center, scale(DIRS[4], k));
  for (let side = 0; side < 6; side++) {
    for (let i = 0; i < k; i++) { out.push(h); h = add(h, DIRS[side]); }
  }
  return out;
}

/** The centre, then ring 1 … ring n: 1 + 3n(n+1) cells. */
export function spiral(center: Axial, n: number): Axial[] {
  const out: Axial[] = [center];
  for (let k = 1; k <= n; k++) out.push(...ring(center, k));
  return out;
}

export const HEX_SIZE = 6; // centre to corner (m)
export const HEX_FLAT = Math.sqrt(3) * HEX_SIZE; // flat to flat ≈ 10.392

export const toWorld = ({ q, r }: Axial, y = 0): { x: number; y: number; z: number } => ({
  x: HEX_SIZE * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r),
  y,
  z: HEX_SIZE * 1.5 * r,
});

/** Indices of the six corner cells of ring(k). */
export const corners = (k: number): number[] => [0, 1, 2, 3, 4, 5].map((s) => s * k);

/** A collision-free integer key for a cell (|q|, |r| < 32768). */
export const cellKey = (c: Axial): number => (c.q + 32768) * 65536 + (c.r + 32768);
export const fromCellKey = (k: number): Axial => ({ q: Math.floor(k / 65536) - 32768, r: (k % 65536) - 32768 });

/** Axial from a world point (inverse of toWorld), rounded to the nearest cell. */
export function fromWorld(x: number, z: number): Axial {
  const r = z / (HEX_SIZE * 1.5);
  const q = x / (HEX_SIZE * Math.sqrt(3)) - r / 2;
  return roundAxial(q, r);
}

export function roundAxial(qf: number, rf: number): Axial {
  const sf = -qf - rf;
  let q = Math.round(qf), r = Math.round(rf), s = Math.round(sf);
  const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;
  return { q: q || 0, r: r || 0 }; // never −0
}
