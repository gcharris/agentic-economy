// Copy the frontend reads but never invents: stage names, gate names, actors,
// the stage word, the Note's reason lines, and the number formats of DESIGN §3
// (credits two decimals, costs one, Φ one-decimal percent, hashes first 8 hex).

import type { HaltReason, Stage } from './state.ts';

export const STAGE_LEVEL: Record<Stage, 1 | 2 | 3 | 4 | 5> = { House: 1, Street: 2, City: 3, Country: 4, World: 5 };
export const STAGE_BY_LEVEL: Record<1 | 2 | 3 | 4 | 5, Stage> = { 1: 'House', 2: 'Street', 3: 'City', 4: 'Country', 5: 'World' };
export const STAGE_NAME: Record<Stage, string> = { House: 'The House', Street: 'The Neighborhood', City: 'The City', Country: 'The Country', World: 'The World' };
export const GATE_NAME: Record<Stage, string> = { House: 'The Door', Street: 'The Letter Slot', City: 'The Clearinghouse', Country: 'Statutory Law', World: 'Recursive STARKs' };
export const STAGE_ACTOR: Record<Stage, string> = { House: 'The Porter', Street: 'The Couriers', City: 'The Municipal Treasury', Country: 'The High Court', World: 'The Global Validators' };
export const STAGE_WORD: Record<Stage, string> = { House: 'the House', Street: 'the Street', City: 'the City', Country: 'the Country', World: 'the World' };

/** The gate name mid-sentence: "approved at the Door", "rejected at the Letter Slot", "at Statutory Law". */
export const gateWord = (gate: Stage): string => GATE_NAME[gate].replace(/^The /, 'the ');

/** `Note::to_plain_line`'s status sentence per HaltReason (ARCHITECTURE §B.2). */
export function haltReasonLine(reason: HaltReason): string {
  switch (reason.kind) {
    case 'runway_exhausted': return `Runway exhausted. A person must top up or close. (${fmtCost(reason.shortfall)} cr short)`;
    case 'closed': return 'Closed by the person. The week is over.';
    case 'slashed': return `Slashed by the High Court. Reserves seized. (${fmtCr(reason.amount)} cr)`;
    case 'partitioned': return 'Partitioned from the rails.';
    case 'week_over': return 'The week is over. The Note is on the table.';
  }
}

/** Credits: two decimals, "754.95". */
export const fmtCr = (x: number): string => (+x || 0).toFixed(2);
/** Costs and fees: one decimal, "10.0". */
export const fmtCost = (x: number): string => (+x || 0).toFixed(1);
/** Φ as a one-decimal percent, "97.3%". */
export const fmtPhi = (phi: number): string => `${((+phi || 0) * 100).toFixed(1)}%`;
/** Joules: two decimals, "3.14". */
export const fmtJ = (x: number): string => (+x || 0).toFixed(2);
/** The first eight hex of a root. */
export const hash8 = (h: string): string => h.slice(0, 8);
