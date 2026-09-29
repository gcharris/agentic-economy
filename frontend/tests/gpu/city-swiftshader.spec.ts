// The city on the real page: scenario 3 in the wasm worker, SwiftShader, mid-NETTED (dome flared, ring leaving).

import { expect, test } from '@playwright/test';

type Hook = { ready: boolean; stepTo(t: number): Promise<number>; render(at?: number): boolean; frame(): { arrivedAt: number; tick: number } | null };

test('scenario 3 renders at band 3 through the NETTED pulse, with no GL errors', async ({ page }) => {
  const bad: string[] = [];
  page.on('console', (m) => { if (/shader|GL_INVALID|WebGL|error/i.test(m.text())) bad.push(m.text()); });
  page.on('pageerror', (e) => bad.push(String(e)));
  await page.goto('/?source=wasm&run=city&clock=manual&quality=balanced');
  await page.waitForFunction(() => (window as unknown as { __app?: Hook }).__app?.ready, undefined, { timeout: 30_000 });
  const info = await page.evaluate(async () => {
    const a = (window as unknown as { __app: Hook }).__app;
    await a.stepTo(1);
    const t0 = a.frame()!.arrivedAt;
    for (const dt of [0.1, 0.2, 0.3, 0.4, 0.48]) a.render(t0 + dt);
    return { stage: document.querySelector('#ladder button.active')?.getAttribute('data-stage'), block: document.querySelector('#block')?.textContent };
  });
  expect(info.stage).toBe('City');
  expect(info.block).toContain('netted 12 envelopes · gross 60.0 → net 20.0');
  await page.screenshot({ path: 'tests/gpu/out/city-netted-t1.png' });
  expect(bad).toEqual([]);
});
