// Tier 3 (ARCHITECTURE §10): the real page, the real renderer, Chromium on SwiftShader.

import { expect, test, type Page } from '@playwright/test';

type AppHandle = { ready: boolean; stepTo(t: number): Promise<number> };
const stepTo = (page: Page, t: number) => page.evaluate((x) => (window as unknown as { __app: AppHandle }).__app.stepTo(x), t);

function watchConsole(page: Page): string[] {
  const bad: string[] = [];
  page.on('console', (m) => { if (/shader|GL_INVALID|WebGL|error/i.test(m.text()) && m.type() !== 'debug') bad.push(m.text()); });
  page.on('pageerror', (e) => bad.push(String(e)));
  return bad;
}

test('the Door is open at recorded ticks 1–4 and closed at 5, on the real page', async ({ page }) => {
  const bad = watchConsole(page);
  await page.goto('/?source=trace&run=house&clock=manual&quality=low');
  await page.waitForFunction(() => (window as unknown as { __app?: AppHandle }).__app?.ready);
  const door = page.locator('dialog#door');
  await expect(door).not.toHaveAttribute('open', '');
  await stepTo(page, 1);
  await expect(door).toHaveAttribute('open', '');
  await page.screenshot({ path: 'tests/gpu/out/room-t1.png' });
  await stepTo(page, 4);
  await expect(door.locator('#door-proof-ticks')).toHaveText('Held 3 ticks');
  await expect(door.locator('#door-proof-purse')).toHaveText('purse unchanged at 754.95 cr');
  await expect(door.locator('#door-proof-phi')).toHaveText('Φ 97.3% then, 89.3% now');
  await page.screenshot({ path: 'tests/gpu/out/door-t4.png' });
  await stepTo(page, 5);
  await expect(door).not.toHaveAttribute('open', '');
  expect(bad).toEqual([]);
});

test('the thumbnail take: tick 4, H = 7 m on the Door, Golden', async ({ page }) => {
  const bad = watchConsole(page);
  await page.goto('/?source=trace&run=house&clock=manual&quality=balanced&take=thumbnail');
  await page.waitForFunction(() => (window as unknown as { __app?: AppHandle }).__app?.ready);
  await stepTo(page, 4);
  await expect(page.locator('dialog#door')).toHaveAttribute('open', '');
  await page.screenshot({ path: 'tests/gpu/out/thumbnail-t4.png' });
  const at = await page.evaluate(() => {
    const a = (window as unknown as { __app: { locate(n: string): { x: number; y: number; visible: boolean } | null } }).__app;
    return { porter: a.locate('Porter'), inspector: a.locate('Inspector') };
  });
  console.log('thumbnail positions', JSON.stringify(at));
  expect(at.porter?.visible).toBe(true);
  expect(bad).toEqual([]);
});
