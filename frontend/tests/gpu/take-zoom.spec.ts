// The zoom take (run with TAKE=1): the room at tick 4 out to the world (world_full 3 × 2 × 3 × 4) in 12 s at 24 fps,
// ending in orbit on the STARK heartbeat of tick 16, frame by frame on a virtual clock, as JPEG into Playwright's
// bundled ffmpeg (MJPEG in, VP8 out). A director take, not a test.
//   TAKE=1 npx playwright test take-zoom        → tests/gpu/out/zoom-room-to-world.webm
// TAKE_PREVIEW=1 renders one frame a second as PNGs instead (TAKE_PREVIEW=6: one every 6 frames).

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const FPS = 24, SECONDS = 12;
/** When the engine is stepped to the heartbeat (tick 16): on arrival in orbit, so its sweep plays out before the end. */
const BEAT_AT = 9.4;
const FFMPEG = '/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux';
type Hook = { ready: boolean; stepTo(t: number): Promise<number>; step(): Promise<number>; render(at?: number): boolean; altitude(a: number): number | null; pending(): number | null; frame(): { arrivedAt: number; tick: number; state: { nodes: { id: number; status: string; stage: string }[] } } | null };

/** The camera's altitude at time s: hold the room 1 s, zoom out to the world over 8.4 s (eased), hold the orbit. */
export function altitudeAt(s: number): number {
  const k = Math.min(1, Math.max(0, (s - 1) / 8.4));
  const e = k * k * (3 - 2 * k);
  return 1.0 + 4.0 * e;
}

test('the zoom take: room at tick 4 → the world, one heartbeat', async ({ page }) => {
  test.skip(!process.env.TAKE && !process.env.TAKE_PREVIEW, 'a director take: TAKE=1 to render');
  test.setTimeout(30 * 60_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?source=wasm&run=world_full&countries=3&cities=2&streets=3&houses=4&clock=manual&zoom=1&take=zoom&quality=balanced');
  await page.waitForFunction(() => (window as unknown as { __app?: Hook }).__app?.ready, undefined, { timeout: 60_000 });
  const start = await page.evaluate(async () => {
    const a = (window as unknown as { __app: Hook }).__app;
    await a.stepTo(4);
    const f = a.frame()!;
    a.altitude(1.0);
    return { t0: f.arrivedAt + 2, status: f.state.nodes.filter((n) => n.stage === 'House').map((n) => n.status)[0] };
  });
  expect(start.status).toBe('waiting_at_door');
  const preview = !!process.env.TAKE_PREVIEW;
  const previewStep = Number(process.env.TAKE_PREVIEW) > 1 ? Number(process.env.TAKE_PREVIEW) : FPS;
  const frames: Buffer[] = [];
  const total = FPS * SECONDS;
  for (let i = 0; i < total; i++) {
    if (preview && i % previewStep !== 0) continue;
    const s = i / FPS;
    await page.evaluate(async ({ a, at, beat }) => {
      const app = (window as unknown as { __app: Hook }).__app;
      // The rig asks the engine at each band edge; the take advances the engine one block to let it answer, so the
      // camera never shows a scale the engine is not simulating (the pending clamp holds it otherwise).
      if (app.altitude(a) !== null) { await app.step(); app.render(at); if (app.pending() !== null) { await app.step(); } }
      if (beat && app.frame()!.tick < 16) { app.render(at); await app.stepTo(16); } // the heartbeat lands now
      app.render(at);
    }, { a: altitudeAt(s), at: start.t0 + s, beat: s >= BEAT_AT });
    const shot = await page.screenshot(preview ? { type: 'png', path: `tests/gpu/out/take-zoom-${(i / FPS).toFixed(2).padStart(5, '0')}s.png` } : { type: 'jpeg', quality: 88 });
    if (!preview) frames.push(shot);
  }
  if (preview) return;
  const mjpeg = 'tests/gpu/out/take-zoom.mjpeg';
  writeFileSync(mjpeg, Buffer.concat(frames));
  // The bundled ffmpeg is trimmed (no mjpeg demuxer): feed the JPEGs through image2pipe, as Playwright's recorder does.
  execFileSync(FFMPEG, ['-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-r', String(FPS), '-i', mjpeg, '-c:v', 'vp8', '-b:v', '5M', '-crf', '8', '-deadline', 'good', '-pix_fmt', 'yuv420p', 'tests/gpu/out/zoom-room-to-world.webm'], { stdio: 'pipe' });
});
