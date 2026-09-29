// The country on the real page: scenario 4 (forged_country) in the wasm worker, looked at from band 4, mid-rollback.

import { expect, test } from '@playwright/test';

type Hook = { ready: boolean; stepTo(t: number): Promise<number>; render(at?: number): boolean; look(b: number): number; frame(): { arrivedAt: number; events: { type: string }[] } | null };

test('scenario 4 mid-unwind: the High Court line, the sweep, the scorches; no GL errors', async ({ page }) => {
  const bad: string[] = [];
  page.on('console', (m) => { if (/shader|GL_INVALID|WebGL|error/i.test(m.text())) bad.push(m.text()); });
  page.on('pageerror', (e) => bad.push(String(e)));
  await page.goto('/?source=wasm&run=country&clock=manual&quality=balanced');
  await page.waitForFunction(() => (window as unknown as { __app?: Hook }).__app?.ready, undefined, { timeout: 30_000 });
  const info = await page.evaluate(async () => {
    const a = (window as unknown as { __app: Hook }).__app;
    await a.stepTo(1);
    a.look(4); // the engine stays at its own scale (the court runs there); the camera looks from the Country
    a.render(a.frame()!.arrivedAt + 1);
    await a.stepTo(3);
    const f = a.frame()!;
    for (const dt of [0.1, 0.25, 0.4, 0.45]) a.render(f.arrivedAt + dt);
    return { types: [...new Set(f.events.map((e) => e.type))], block: document.querySelector('#block')?.textContent ?? '' };
  });
  expect(info.types).toContain('ROLLED_BACK');
  expect(info.block).toMatch(/rolled back to t\d+/);
  await page.screenshot({ path: 'tests/gpu/out/country-rollback.png' });
  expect(bad).toEqual([]);
});
