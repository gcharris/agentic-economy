// The live Door take (run with TAKE=1): the wasm house run at band 1, the HUD and the Door card shown, 11.5 s at 24 fps
// on a virtual clock. The Porter knocks (t1); the proof line counts two held ticks (t3); "No, leave it on the table"
// (t4: the paper returns, ember on the step, the rejection in the feed); the next knock (t5); "Yes, send it" (t6: the
// Door swings, the Porter steps out, gold leaf, the purse down by the fee). Decisions go through the manual handle's
// command hook, as a person's click would, and land at the next block. A director take, not a test.
//   TAKE=1 npx playwright test take-door        → tests/gpu/out/door-live.webm
// TAKE_PREVIEW=12 renders every 12th frame as PNGs instead.

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const FPS = 24, SECONDS = 11.5;
const FFMPEG = '/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux';
type Held = { envelope: number };
type Hook = {
  ready: boolean; step(): Promise<number>; render(at?: number): boolean;
  frame(): { arrivedAt: number; tick: number; state: { held: Held[] } } | null;
  command(c: { decision: 'approve' | 'reject'; envelope: number }): Promise<boolean>;
};
/** The script: at s seconds, step one block, or answer the Door (the held envelope) through the command hook. */
const BEATS: { at: number; act: 'step' | 'reject' | 'approve' }[] = [
  { at: 0, act: 'step' },      // t1: the Porter walks to the Door and knocks; the card opens
  { at: 2.0, act: 'step' },    // t2: held 1 tick
  { at: 3.4, act: 'step' },    // t3: held 2 ticks
  { at: 4.5, act: 'reject' },  // "No, leave it on the table"
  { at: 4.8, act: 'step' },    // t4: REJECTED: the paper returns to the table, ember on the step
  { at: 6.4, act: 'step' },    // t5: the next knock
  { at: 7.9, act: 'approve' }, // "Yes, send it"
  { at: 8.2, act: 'step' },    // t6: APPROVED: the Door swings, the Porter steps out, gold leaf; the purse drops by the fee
];


test('the live Door take: knock, two held ticks, No; knock, Yes', async ({ page }) => {
  test.skip(!process.env.TAKE && !process.env.TAKE_PREVIEW, 'a director take: TAKE=1 to render');
  test.setTimeout(20 * 60_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?source=wasm&run=house&clock=manual&take=door&quality=balanced');
  await page.waitForFunction(() => (window as unknown as { __app?: Hook }).__app?.ready, undefined, { timeout: 60_000 });
  const t0 = await page.evaluate(() => performance.now() / 1000 + 1);
  const preview = Number(process.env.TAKE_PREVIEW) || 0;
  const frames: Buffer[] = [];
  const seen: Record<string, string> = {};
  let beat = 0;
  for (let i = 0; i < FPS * SECONDS; i++) {
    const s = i / FPS;
    while (beat < BEATS.length && BEATS[beat].at <= s) {
      const b = BEATS[beat++];
      const r = await page.evaluate(async ({ act, at }) => {
        const app = (window as unknown as { __app: Hook }).__app;
        app.render(at);
        if (act === 'step') { await app.step(); return app.frame()!.tick; }
        const held = app.frame()!.state.held[0];
        return held ? app.command({ decision: act, envelope: held.envelope }).then((ok) => (ok ? held.envelope : -1)) : -1;
      }, { act: b.act, at: t0 + s });
      expect(r).not.toBe(-1);
      // What the take must show, read off the page at each beat.
      seen[`${b.act}@${b.at}`] = await page.evaluate(() => [
        (document.querySelector('dialog#door') as HTMLDialogElement).open ? 'open' : 'closed',
        (document.querySelector('#door-proof-ticks')?.textContent ?? '').trim(),
        (document.querySelector('#focus-purse .v')?.textContent ?? '').trim(),
        (document.querySelector('#feed li[data-type="REJECTED"]')?.textContent ?? '').trim(),
      ].join(' | '));
    }
    await page.evaluate((at) => (window as unknown as { __app: Hook }).__app.render(at), t0 + s);
    if (preview) { if (i % preview === 0) await page.screenshot({ path: `tests/gpu/out/take-door-${s.toFixed(2).padStart(5, '0')}s.png` }); continue; }
    frames.push(await page.screenshot({ type: 'jpeg', quality: 90 }));
  }
  console.log(JSON.stringify(seen, null, 1));
  expect(seen['step@0']).toMatch(/^open/);
  expect(seen['step@3.4']).toContain('Held 2 ticks');
  expect(seen['step@4.8']).toMatch(/^closed .*t4 · /);
  expect(seen['step@6.4']).toMatch(/^open/);
  const purse = (k: string) => Number(/purse ([\d.,]+) \//.exec(seen[k])?.[1].replace(/,/g, ''));
  expect(purse('step@6.4') - purse('step@8.2')).toBeCloseTo(10, 6); // the send fee, the frame after Yes
  expect(seen['step@8.2']).toMatch(/^closed/);
  if (preview) return;
  const mjpeg = 'tests/gpu/out/take-door.mjpeg';
  writeFileSync(mjpeg, Buffer.concat(frames));
  execFileSync(FFMPEG, ['-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-r', String(FPS), '-i', mjpeg, '-c:v', 'vp8', '-b:v', '5M', '-crf', '8', '-deadline', 'good', '-pix_fmt', 'yuv420p', 'tests/gpu/out/door-live.webm'], { stdio: 'pipe' });
});
