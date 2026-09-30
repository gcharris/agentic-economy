// Replay the native playtest's exact public API inputs through the shipped wasm.
import { expect, test } from 'vitest';
import native from '../fixtures/elm-playtest-native.json';
import { freshEngine } from '../helpers/assets.ts';

test('twenty native seeds replay to identical Notes in wasm, including deterministic repeats', () => {
  for (const run of native) {
    const replay = () => {
      const e = freshEngine();
      const x = e.x as typeof e.x & {
        engine_new_game(h: number, b: number, tasks: number, week: number, walk: number, person: number, seed: bigint, visible: number): void;
        engine_sync(node: bigint): number;
      };
      x.engine_new_game(4, 800, 15, 40, 1, 1, BigInt(run.seed), 1);
      for (let tick = 0; tick < 40; tick++) {
        for (const action of run.actions.filter((a) => a[0] === tick)) {
          const id = BigInt(action[2]);
          const ok = action[1] === 'sync' ? x.engine_sync(id) : action[1] === 'approve' ? x.engine_authorize(id) : x.engine_reject(id);
          expect(ok).toBe(1);
        }
        e.tick(); e.events();
      }
      return run.houses.map((h) => e.state().nodes.find((n) => n.name === h.note.node_name)!.note);
    };
    const expected = run.houses.map((h) => h.note);
    expect(replay(), `native parity seed ${run.seed}`).toEqual(expected);
    expect(replay(), `wasm repeat seed ${run.seed}`).toEqual(expected);
  }
});
