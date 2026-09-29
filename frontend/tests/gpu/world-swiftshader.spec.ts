// The world on the real page: world_full(3, 2, 3, 4) in the wasm worker at the World, the STARK heartbeat at tick 16
// caught mid-sweep (the meridian part way round, the comet on the ring, the cyan tab on the ticker).

import { expect, test } from '@playwright/test';

type Hook = { ready: boolean; stepTo(t: number): Promise<number>; render(at?: number): boolean; pending(): number | null; frame(): { arrivedAt: number; tick: number; state: { active_scale: string }; events: { type: string; latency_ticks?: number }[] } | null };

test('world_full at the World: the globe, three beacons, the heartbeat mid-sweep at tick 16; no GL errors', async ({ page }) => {
  const bad: string[] = [];
  page.on('console', (m) => { if (/shader|GL_INVALID|WebGL|error/i.test(m.text())) bad.push(m.text()); });
  page.on('pageerror', (e) => bad.push(String(e)));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?source=wasm&run=world_full&countries=3&cities=2&streets=3&houses=4&zoom=5&clock=manual&quality=balanced');
  await page.waitForFunction(() => (window as unknown as { __app?: Hook }).__app?.ready, undefined, { timeout: 30_000 });
  const info = await page.evaluate(async () => {
    const a = (window as unknown as { __app: Hook }).__app;
    await a.stepTo(1);
    a.render(a.frame()!.arrivedAt + 0.5);
    await a.stepTo(16);
    const f = a.frame()!;
    const beat = f.events.find((e) => e.type === 'GLOBAL_STATE_CONFIRMED');
    const k = 0.35; // mid-sweep
    a.render(f.arrivedAt + k * (beat?.latency_ticks ?? 8) * 0.25);
    return { tick: f.tick, scale: f.state.active_scale, latency: beat?.latency_ticks ?? null, stark: document.querySelectorAll('#ticker .tab.stark').length };
  });
  expect(info.tick).toBe(16);
  expect(info.scale).toBe('World');
  expect(info.latency).not.toBeNull();
  expect(info.stark).toBe(1);
  await page.screenshot({ path: 'tests/gpu/out/world-heartbeat.png' });
  expect(bad).toEqual([]);
});
