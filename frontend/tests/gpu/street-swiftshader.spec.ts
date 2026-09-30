// The street on the real page (ARCHITECTURE §10 tier 3): six cottages on the ring, a handshake at the kerb.

import { expect, test } from '@playwright/test';

type Hook = { ready: boolean; stepTo(t: number): Promise<number>; render(at?: number): boolean; locate(n: string): { x: number; y: number; visible: boolean } | null };

test('the recorded street renders at band 2 mid-handshake, with no GL errors', async ({ page }) => {
  const bad: string[] = [];
  page.on('console', (m) => { if (!/GPU stall due to ReadPixels/.test(m.text()) && /shader|GL_INVALID|WebGL|error/i.test(m.text())) bad.push(m.text()); });
  page.on('pageerror', (e) => bad.push(String(e)));
  await page.goto('/?source=trace&run=street&clock=manual&quality=balanced');
  await page.waitForFunction(() => (window as unknown as { __app?: Hook }).__app?.ready);
  const seen = await page.evaluate(async () => {
    const a = (window as unknown as { __app: Hook }).__app;
    await a.stepTo(3);
    const t = performance.now() / 1000;
    for (let k = 0; k <= 12; k++) a.render(t + k * 0.1); // settle the spring, land in the handshake's verify beat
    return document.querySelector('#ladder button.active')?.getAttribute('data-stage');
  });
  expect(seen).toBe('Street');
  await page.screenshot({ path: 'tests/gpu/out/street-t3.png' });
  expect(bad).toEqual([]);
});
