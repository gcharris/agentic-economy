// Stations and the Porter's walks (DESIGN §4). Pure: status + the room's clips → where each cat stands, which
// way it faces and in which pose. The room band calls it once per render frame; nothing here reads a Frame.

import type { NodeStatus } from '../../engine/contract/state.ts';
import type { Pose } from './actors/PegCat.ts';
import { STEPS_PER_S, type SeatName } from './actors/seats.ts';

export interface Placement { x: number; z: number; /** radians about +y; 0 faces +z (south) */ yaw: number; pose: Pose; phase: number; visible: boolean; carrying: boolean; bob: number }

const NORTH = Math.PI, EAST = Math.PI / 2, WEST = -Math.PI / 2, SOUTH = 0;
type Station = { x: number; z: number; yaw: number; pose: Pose };

export const STATIONS: Record<SeatName, Station> = {
  Scout: { x: -2.7, z: -2.3, yaw: NORTH, pose: 'work' },       // at the shelf
  Scribble: { x: -1.0, z: 1.0, yaw: NORTH, pose: 'work' },     // seated, facing north
  Inspector: { x: 1.2, z: -1.0, yaw: SOUTH + 0.5, pose: 'work' }, // the table's NE end
  Penny: { x: 1.8, z: -0.8, yaw: WEST, pose: 'work' },         // sweeping at the table edge
  Porter: { x: 2.0, z: 0.2, yaw: EAST, pose: 'idle' },         // waiting for a draft
};
export const PORTER_AT_DOOR = { x: 3.4, z: 0.0 } as const;
export const PORTER_OUTSIDE = { x: 4.6, z: 0.0 } as const;

/** What the room is animating for the Porter, from the room's own clip record. */
export interface PorterClip { kind: 'carry' | 'seal' | 'burn'; t0: number; duration: number }

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function place(seat: SeatName, status: NodeStatus, t: number, porter: PorterClip | null, reducedMotion: boolean): Placement {
  const st = STATIONS[seat];
  const rate = STEPS_PER_S[seat];
  if (seat === 'Porter') return placePorter(status, t, porter, reducedMotion);
  if (status === 'waiting_at_door') {
    // Waiting is stillness: every cat frozen at its station, no bob, no sway.
    return { x: st.x, z: st.z, yaw: st.yaw, pose: st.pose, phase: 0, visible: true, carrying: false, bob: 0 };
  }
  if (status === 'halted') return { x: st.x, z: st.z, yaw: st.yaw, pose: 'idle', phase: 0, visible: true, carrying: false, bob: 0 };
  const phase = reducedMotion ? 0 : t * rate;
  const bob = reducedMotion ? 0 : seat === 'Scribble' ? 0.004 * Math.sin(2 * Math.PI * 4 * t) : 0.01 * Math.sin(2 * Math.PI * 0.5 * t + st.x);
  return { x: st.x, z: st.z, yaw: st.yaw, pose: st.pose, phase, visible: true, carrying: false, bob };
}

function placePorter(status: NodeStatus, t: number, clip: PorterClip | null, reduced: boolean): Placement {
  const idle = STATIONS.Porter;
  const base = { phase: 0, visible: true, carrying: false, bob: 0 };
  if (clip && t >= clip.t0 && t < clip.t0 + clip.duration) {
    const k = easeInOut((t - clip.t0) / clip.duration);
    const walking = !reduced;
    if (clip.kind === 'carry') { // PROPOSED: table → Door, envelope leading
      return { ...base, x: lerp(idle.x, PORTER_AT_DOOR.x, k), z: lerp(idle.z, PORTER_AT_DOOR.z, k), yaw: EAST, pose: walking ? 'walkA' : 'idle', phase: t * STEPS_PER_S.Porter, carrying: true };
    }
    if (clip.kind === 'seal') { // APPROVED: the Porter steps out through the open Door
      return { ...base, x: lerp(PORTER_AT_DOOR.x, PORTER_OUTSIDE.x, k), z: 0, yaw: EAST, pose: walking ? 'walkA' : 'idle', phase: t * STEPS_PER_S.Porter, carrying: true, visible: k < 0.95 };
    }
    // REJECTED: the paper goes back to the table
    return { ...base, x: lerp(PORTER_AT_DOOR.x, idle.x, k), z: lerp(PORTER_AT_DOOR.z, idle.z, k), yaw: WEST, pose: walking ? 'walkA' : 'idle', phase: t * STEPS_PER_S.Porter, carrying: true };
  }
  if (status === 'waiting_at_door') return { ...base, x: PORTER_AT_DOOR.x, z: PORTER_AT_DOOR.z, yaw: EAST, pose: 'wait', carrying: true };
  return { ...base, x: idle.x, z: idle.z, yaw: idle.yaw, pose: 'idle' };
}
