import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import baseline from '../fixtures/demo-round1-hashes.json';
import { freshEngine } from '../helpers/assets.ts';
test('all five demo scenarios retain round-one state and event bytes for forty ticks', () => {
  for (const run of baseline) {
    const e = freshEngine(), x = e.x;
    const read = (len: number) => new TextDecoder().decode(new Uint8Array(x.memory.buffer, x.engine_out_ptr(), len));
    x.engine_new(run.scenario, 7n, 800, 15, 1);
    for (let t = 0; t < 40; t++) {
      for (const [i, h] of e.state().held.entries()) {
        if ((t + i) % 4 === 0) x.engine_reject(BigInt(h.envelope)); else x.engine_authorize(BigInt(h.envelope));
      }
      if (run.scenario === 2 && (t === 4 || t === 14)) x.engine_set_truth_price(t === 4 ? 12 : 10);
      e.tick();
      const hash = createHash('sha256').update(read(x.engine_state()) + '\n' + read(x.engine_events())).digest('hex');
      expect(hash, `scenario ${run.scenario}, tick ${t+1}`).toBe(run.hashes[t]);
    }
  }
});
