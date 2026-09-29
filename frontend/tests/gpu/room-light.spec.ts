// REVIEW-ROOM §1–2, measured on the real frame: the room is lit, not a silhouette.
// Median floor luminance ≥ 40/255; the north wall distinguishable from the floor; no cat's centre below 20/255.

import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

type Pt = { x: number; y: number; visible: boolean };
type Hook = { ready: boolean; stepTo(t: number): Promise<number>; render(at?: number): boolean; locatePoint(x: number, y: number, z: number): Pt; locate(n: string): Pt | null };

const lum = (png: PNG, x: number, y: number) => {
  const i = (png.width * y + x) * 4;
  return 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2];
};
function patch(png: PNG, p: Pt, r: number): number[] {
  const out: number[] = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = p.x + dx, y = p.y + dy;
    if (x >= 0 && y >= 0 && x < png.width && y < png.height) out.push(lum(png, x, y));
  }
  return out;
}
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

test('the room at Golden is lit: floor, wall and every cat clear the review thresholds', async ({ page }) => {
  await page.goto('/?source=trace&run=house&clock=manual&quality=balanced');
  await page.waitForFunction(() => (window as unknown as { __app?: Hook }).__app?.ready);
  // Tick 5: the Door has answered, no card and no backdrop; render three seconds on so the swing is over.
  const pts = await page.evaluate(async () => {
    const a = (window as unknown as { __app: Hook }).__app;
    await a.stepTo(5);
    a.render(performance.now() / 1000 + 3);
    const floor = [[-2.2, 0, 1.9], [2.6, 0, 1.6], [-3.2, 0, -0.6], [0.4, 0, 2.3], [2.9, 0, -1.4], [-0.2, 0, -1.6]].map(([x, y, z]) => a.locatePoint(x, y, z));
    const wall = [[-0.6, 2.2, -2.99], [1.0, 1.6, -2.99], [3.99, 2.4, 1.8]].map(([x, y, z]) => a.locatePoint(x, y, z));
    const cats = ['Scout', 'Scribble', 'Inspector', 'Penny', 'Porter'].map((n) => ({ n, p: a.locate(n)! }));
    return { floor, wall, cats };
  });
  await page.addStyleTag({ content: '#hud, #ticker, #banner { display: none !important; }' });
  const png = PNG.sync.read(await page.screenshot({ path: 'tests/gpu/out/room-lit-t5.png' }));
  const floor = median(pts.floor.flatMap((p) => patch(png, p, 4)));
  const wall = median(pts.wall.flatMap((p) => patch(png, p, 4)));
  const cats = pts.cats.map(({ n, p }) => ({ n, l: median(patch(png, p, 2)) }));
  console.log('luminance', JSON.stringify({ floor, wall, cats }));
  expect(floor).toBeGreaterThanOrEqual(40);
  expect(Math.abs(wall - floor)).toBeGreaterThanOrEqual(6);
  for (const c of cats) expect(c.l, c.n).toBeGreaterThanOrEqual(20);
});
