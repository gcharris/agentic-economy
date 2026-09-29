// The World (Stage 5): countries by ascending id spaced evenly on the 30° N
// circle of a sphere of radius 6,000 m. Pure and deterministic.

import type { NodeId, NodeView } from '../contract/state.ts';

export const WORLD_RADIUS = 6000;
export const WORLD_LATITUDE = (30 * Math.PI) / 180;

export interface Beacon { id: NodeId; lat: number; lon: number; x: number; y: number; z: number }
export interface WorldLayout { beacons: Map<NodeId, Beacon>; order: NodeId[] }

type Shape = Pick<NodeView, 'id' | 'parent' | 'stage'>;

export function sphericalToWorld(lat: number, lon: number, radius = WORLD_RADIUS): { x: number; y: number; z: number } {
  return { x: radius * Math.cos(lat) * Math.cos(lon), y: radius * Math.sin(lat), z: radius * Math.cos(lat) * Math.sin(lon) };
}

/** Countries (stage Country; else the roots) by ascending id, evenly around the 30° N circle starting at lon 0. */
export function layoutWorld(nodes: readonly Shape[]): WorldLayout {
  let countries = nodes.filter((n) => n.stage === 'Country');
  if (countries.length === 0) countries = nodes.filter((n) => n.parent === null);
  const order = countries.map((n) => n.id).sort((a, b) => a - b);
  const beacons = new Map<NodeId, Beacon>();
  order.forEach((id, i) => {
    const lon = (2 * Math.PI * i) / order.length;
    const p = sphericalToWorld(WORLD_LATITUDE, lon);
    beacons.set(id, { id, lat: WORLD_LATITUDE, lon, ...p });
  });
  return { beacons, order };
}
