// Ids at the wire. `NodeId(u64)` / `EnvelopeId(u64)` are transparent newtypes
// in the engine and travel as JSON numbers minted below 2^52 (largest in the
// trace: 3781345924436676), so they are exact in a double and compare with
// `===`. BigInt appears only at the wasm boundary (`toU64`) and across
// postMessage, where ids travel as decimal strings (`idToString`).

export type NodeId = number;
export type EnvelopeId = number;

/** Every id the engine mints is below this; anything at or above is a bug upstream. */
export const MAX_ID = 2 ** 52;

export function assertJsonSafe(id: number, what = 'id'): number {
  if (!Number.isInteger(id) || id < 0 || id >= MAX_ID) {
    throw new RangeError(`${what} ${String(id)} is not a JSON-safe u64 below 2^52`);
  }
  return id;
}

/** The wasm ABI takes `u64` parameters as BigInt. */
export function toU64(id: number): bigint {
  return BigInt(assertJsonSafe(id));
}

/** A `u64` coming back from wasm (engine_tick) or a decimal string; refuses anything above 2^52. */
export function fromU64(v: bigint | number | string, what = 'u64'): number {
  const b = typeof v === 'bigint' ? v : BigInt(v);
  if (b < 0n || b >= BigInt(MAX_ID)) throw new RangeError(`${what} ${b.toString()} is not below 2^52`);
  return Number(b);
}

/** Ids cross postMessage as decimal strings (no float, no BigInt clone surprises). */
export const idToString = (id: number): string => String(assertJsonSafe(id));
export const idFromString = (s: string): number => fromU64(s, 'id');

/** A stable 0–1 hash of an id, for per-instance seeds (`aSeed`). Deterministic, no Math.random. */
export function idSeed(id: number): number {
  let h = (id >>> 0) ^ Math.floor(id / 4294967296);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
