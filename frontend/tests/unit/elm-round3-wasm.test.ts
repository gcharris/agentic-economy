import { expect, test } from 'vitest';
import runs from '../fixtures/elm-round3-native.json';
import { freshEngine } from '../helpers/assets.ts';

type GameExports = ReturnType<typeof freshEngine>['x'] & {
  engine_new_game(h: number, b: number, t: number, w: number, walk: number, person: number, seed: bigint, v: number): void;
};

test('all eight slow-walk variants and twenty seeds repeat the native Notes in wasm', () => {
  for (const run of runs) {
    const replay = () => {
      const e = freshEngine();
      const x = e.x as GameExports;
      x.engine_new_game(4, run.budget, 15, run.week, 1, 1, BigInt(run.seed), 1);
      expect(x.engine_game_options(run.oracle, run.cadence)).toBe(1);
      expect(x.engine_send_ticks(run.send_ticks)).toBe(1);
      for (let tick = 0; tick < run.week; tick++) {
        for (const action of run.actions.filter((a) => a[0] === tick)) {
          const ok = action[1] === 'top_up'
            ? x.engine_top_up(BigInt(action[2]), Number(action[3]))
            : x.engine_answer(BigInt(action[2]), BigInt(action[3]), Number(action[4]));
          expect(ok, `${run.send_ticks}/${run.week}/${run.cadence}/${run.seed}, ${action}`).toBe(1);
        }
        e.tick();
        e.events();
      }
      return run.houses.map((h) => e.state().nodes.find((n) => n.name === h.note.node_name)!.note);
    };
    const expected = run.houses.map((h) => h.note);
    expect(replay()).toEqual(expected);
    expect(replay()).toEqual(expected);
  }
}, 60000);

test('the send-duration knob is game-only, positive, and fixed before the first tick', () => {
  const e = freshEngine();
  e.x.engine_new(1, 7n, 800, 15, 1);
  expect(e.x.engine_send_ticks(3)).toBe(0);
  const x = e.x as GameExports;
  x.engine_new_game(4, 800, 15, 40, 1, 1, 7n, 1);
  const before = e.state();
  expect(x.engine_send_ticks(0)).toBe(0);
  expect(e.state()).toEqual(before);
  expect(x.engine_send_ticks(3)).toBe(1);
  e.tick();
  const started = e.state();
  expect(x.engine_send_ticks(2)).toBe(0);
  expect(e.state()).toEqual(started);
});
