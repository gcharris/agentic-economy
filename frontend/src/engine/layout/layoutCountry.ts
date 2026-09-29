// The Country (Stage 4): its own hex grid at HEX_SIZE × 7, the Country at
// (0,0), its cities on rings in ascending id. Pure and deterministic.

import type { NodeId, NodeView } from '../contract/state.ts';
import { HEX_SIZE, ring, type Axial } from './hex.ts';

export const COUNTRY_HEX_SIZE = HEX_SIZE * 7; // 42 m centre to corner
export const COUNTRY_HEX_FLAT = Math.sqrt(3) * COUNTRY_HEX_SIZE;

export interface CountryLayout {
  country: NodeId | null;
  cell: Map<NodeId, Axial>; // the Country and each city
  radius: number;
}

type Shape = Pick<NodeView, 'id' | 'parent' | 'stage'>;

/** Layout one country's grid. `countryId` picks the Country; by default the lowest-id node of stage Country (or the lowest root). */
export function layoutCountry(nodes: readonly Shape[], countryId?: NodeId): CountryLayout {
  const cell = new Map<NodeId, Axial>();
  const countries = nodes.filter((n) => n.stage === 'Country').sort((a, b) => a.id - b.id);
  const roots = nodes.filter((n) => n.parent === null).sort((a, b) => a.id - b.id);
  const country = countryId ?? countries[0]?.id ?? roots[0]?.id ?? null;
  if (country === null) return { country: null, cell, radius: 0 };
  cell.set(country, { q: 0, r: 0 });
  const cities = nodes.filter((n) => n.parent === country).sort((a, b) => a.id - b.id);
  let k = 0, placed = 0, cells: Axial[] = [];
  for (const c of cities) {
    if (placed === cells.length) { k++; cells = ring({ q: 0, r: 0 }, k); placed = 0; }
    cell.set(c.id, cells[placed++]);
  }
  return { country, cell, radius: k };
}

export const toCountryWorld = ({ q, r }: Axial, y = 0): { x: number; y: number; z: number } => ({
  x: COUNTRY_HEX_SIZE * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r),
  y,
  z: COUNTRY_HEX_SIZE * 1.5 * r,
});
