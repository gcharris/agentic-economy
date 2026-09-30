import { expect, test } from 'vitest';
import native from '../fixtures/elm-playtest-native.json';
import { freshEngine } from '../helpers/assets.ts';
test('twenty native seeds and all sixteen variants replay to identical Notes in wasm', () => {
  for (const run of native) {
    const replay = () => {
      const e = freshEngine();
      const x = e.x as typeof e.x & {
        engine_new_game(h: number, b: number, tasks: number, week: number, walk: number, person: number, seed: bigint, visible: number): void;
      };
      x.engine_new_game(4, run.budget, 15, run.week, 1, 1, BigInt(run.seed), 1);
      expect(x.engine_game_options(run.oracle, run.cadence)).toBe(1);
      for (let tick = 0; tick < run.week; tick++) {
        for (const action of run.actions.filter((a) => a[0] === tick)) {
          const ok = action[1] === 'top_up' ? x.engine_top_up(BigInt(action[2]), Number(action[3]))
            : x.engine_answer(BigInt(action[2]), BigInt(action[3]), Number(action[4]));
          expect(ok, JSON.stringify({ seed: run.seed, budget: run.budget, cadence: run.cadence, oracle: run.oracle, week: run.week, action })).toBe(1);
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
