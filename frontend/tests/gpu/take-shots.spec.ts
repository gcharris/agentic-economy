// The shot list's short takes (RECORDING-PLAN.md), one runner: each shot is a URL, a setup run before the first
// frame (not recorded), timed beats (engine steps and commands through the manual handle), and optionally an altitude
// curve (the rig asks the engine at each band edge; the runner steps one block so it can answer, as the zoom take
// does). 24 fps on a virtual clock, JPEG into Playwright's bundled ffmpeg (VP8). Director takes, not tests.
//   TAKE=1 npx playwright test take-shots                       → tests/gpu/out/shot-<name>.webm, every shot
//   TAKE=1 SHOT=court-rollback npx playwright test take-shots   → one shot
// scripts/encode-takes.sh turns the WebMs into the 1280 × 720 MP4s under takes/.

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { test } from '@playwright/test';

const FPS = 24;
const FFMPEG = '/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux';
const WORLD = 'source=wasm&run=world_full&countries=3&cities=2&streets=3&houses=4';

interface Shot {
  name: string; url: string; seconds: number;
  /** Page-side statements with `a` bound to window.__app. */
  setup: string;
  beats: { at: number; js: string }[];
  /** Piecewise-linear altitude, [seconds, A] pairs. */
  altitude?: [number, number][];
}

export const SHOTS: Shot[] = [
  { name: 'room-t4', url: '/?source=trace&run=house&clock=manual&take=thumbnail&quality=balanced', seconds: 4, setup: 'await a.stepTo(4);', beats: [] },
  { name: 'street-settle-revert', url: '/?source=trace&run=street&clock=manual&quality=balanced', seconds: 6, setup: 'await a.stepTo(5);',
    beats: [{ at: 0.3, js: 'await a.step();' }, { at: 3.0, js: 'await a.step();' }] }, // t6 settles; t7 the hash-mismatch revert
  { name: 'city-netted', url: '/?source=wasm&run=city&clock=manual&quality=balanced', seconds: 4, setup: 'await a.stepTo(1);',
    beats: [{ at: 0.4, js: 'await a.step();' }, { at: 2.4, js: 'await a.step();' }] },
  { name: 'city-drifted', url: '/?source=wasm&run=city&streets=6&houses=8&clock=manual&take=zoom&quality=balanced', seconds: 5,
    // The Door sequence: the engine at the House, then the Street; streets 1–3 answered, 4–6 left at the Door; back to the City.
    setup: `await a.stepTo(1); await a.command({ decision: 'zoom', stage: 1 }); await a.step(); await a.step();
      await a.command({ decision: 'zoom', stage: 2 });
      for (let i = 0; i < 12; i++) { for (const h of a.frame().state.held) if (/^S[123] /.test(h.node_name)) await a.command({ decision: 'approve', envelope: h.envelope }); await a.step(); }
      await a.command({ decision: 'zoom', stage: 3 }); await a.step();`,
    beats: [{ at: 1.5, js: 'await a.step();' }, { at: 3.5, js: 'await a.step();' }] },
  { name: 'court-rollback', url: '/?source=wasm&run=country&clock=manual&quality=balanced', seconds: 3.5, setup: 'await a.stepTo(2); a.look(4);',
    beats: [{ at: 0.4, js: 'await a.step();' }] }, // t3: ROLLED_BACK, the unwind; VOIDED, SLASHED
  { name: 'heartbeat', url: `/?${WORLD}&zoom=5&clock=manual&quality=balanced`, seconds: 3.5, setup: 'await a.stepTo(15);',
    beats: [{ at: 0.4, js: 'await a.step();' }] }, // t16: GLOBAL_STATE_CONFIRMED, the meridian sweep, the cyan tab
  { name: 'streets-seal-unpack', url: '/?source=wasm&run=world_full&countries=1&cities=3&streets=6&houses=8&zoom=3&clock=manual&take=zoom&quality=balanced',
    seconds: 9, setup: 'await a.stepTo(1);', beats: [],
    altitude: [[0, 3.0], [1, 3.0], [3.5, 4.0], [5, 4.0], [7.5, 3.0], [9, 3.0]] }, // up: the streets seal (PACKED); down: UNPACKED
];

const altitudeAt = (curve: [number, number][], s: number): number => {
  for (let i = 1; i < curve.length; i++) {
    const [s0, a0] = curve[i - 1], [s1, a1] = curve[i];
    if (s <= s1) { const k = Math.max(0, (s - s0) / (s1 - s0)); const e = k * k * (3 - 2 * k); return a0 + (a1 - a0) * e; }
  }
  return curve[curve.length - 1][1];
};

for (const shot of SHOTS) {
  test(`shot: ${shot.name}`, async ({ page }) => {
    test.skip(!process.env.TAKE || (!!process.env.SHOT && process.env.SHOT !== shot.name), 'a director take: TAKE=1 (SHOT=name) to render');
    test.setTimeout(20 * 60_000);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(shot.url);
    await page.waitForFunction(() => (window as unknown as { __app?: { ready: boolean } }).__app?.ready, undefined, { timeout: 60_000 });
    const t0 = await page.evaluate(`(async () => { const a = window.__app; ${shot.setup} return (a.frame()?.arrivedAt ?? performance.now() / 1000) + 1; })()`) as number;
    const frames: Buffer[] = [];
    let beat = 0;
    for (let i = 0; i < Math.round(FPS * shot.seconds); i++) {
      const s = i / FPS, at = t0 + s;
      while (beat < shot.beats.length && shot.beats[beat].at <= s) {
        await page.evaluate(`(async () => { const a = window.__app; a.render(${at}); ${shot.beats[beat++].js} })()`);
      }
      const alt = shot.altitude ? altitudeAt(shot.altitude, s) : null;
      await page.evaluate(`(async () => { const a = window.__app;
        if (${alt} !== null && a.altitude(${alt}) !== null) { await a.step(); a.render(${at}); if (a.pending() !== null) await a.step(); }
        a.render(${at}); })()`);
      frames.push(await page.screenshot({ type: 'jpeg', quality: 90 }));
    }
    const mjpeg = `tests/gpu/out/shot-${shot.name}.mjpeg`;
    writeFileSync(mjpeg, Buffer.concat(frames));
    execFileSync(FFMPEG, ['-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-r', String(FPS), '-i', mjpeg, '-c:v', 'vp8', '-b:v', '5M', '-crf', '8', '-deadline', 'good', '-pix_fmt', 'yuv420p', `tests/gpu/out/shot-${shot.name}.webm`], { stdio: 'pipe' });
  });
}
