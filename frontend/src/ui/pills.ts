// Status pill copy (ARCHITECTURE §B.2). The pill is the lantern made legible.

import type { NodeStatus } from '../engine/contract/state.ts';

export const PILL: Record<NodeStatus, string> = {
  active: 'active',
  waiting_at_door: 'waiting at the door · 0.0 cr idle burn',
  halted: 'halted · the note is on the table',
  packed: 'packed · statistical stasis',
  partitioned: 'partitioned',
};

export const pillText = (s: NodeStatus): string => PILL[s];
