// The city on the real page: engine_new_city(6, 8) in the wasm worker, SwiftShader.
// 1. Tick 1 mid-NETTED (dome flared, ring leaving). 2. Φ mixed, by the engine's own rule: every house's send is put to
//    the person at the Door (zoom/1 for two ticks), the engine returns to the Street gate (zoom/3 would pack the city),
//    the Doors on streets 1–3 are answered each tick and those on streets 4–6 are left waiting. A waiting house is frozen
//    and its Φ decays by doc 02's idle rule, so after twelve ticks half the city has drifted (0.652) and half is crisp.

import { expect, test, type Page } from '@playwright/test';

type Held = { envelope: number; node_name: string };
type Hook = {
  ready: boolean; stepTo(t: number): Promise<number>; step(): Promise<number>; render(at?: number): boolean;
  frame(): { arrivedAt: number; tick: number; state: { held: Held[]; nodes: { stage: string; confidence: number; status: string }[] } } | null;
  command(c: unknown): Promise<boolean>;
};
const URL = '/?source=wasm&run=city&streets=6&houses=8&clock=manual&quality=balanced';

async function open(page: Page, bad: string[]) {
  page.on('console', (m) => { if (/shader|GL_INVALID|WebGL|error/i.test(m.text())) bad.push(m.text()); });
  page.on('pageerror', (e) => bad.push(String(e)));
  await page.goto(URL);
  await page.waitForFunction(() => (window as unknown as { __app?: Hook }).__app?.ready, undefined, { timeout: 30_000 });
}

test('6 x 8 city at tick 1: the NETTED pulse, no GL errors', async ({ page }) => {
  const bad: string[] = [];
  await open(page, bad);
  const info = await page.evaluate(async () => {
    const a = (window as unknown as { __app: Hook }).__app;
    await a.stepTo(1);
    const t0 = a.frame()!.arrivedAt;
    for (const dt of [0.1, 0.2, 0.3, 0.4, 0.55]) a.render(t0 + dt);
    return { stage: document.querySelector('#ladder button.active')?.getAttribute('data-stage'), houses: a.frame()!.state.nodes.filter((n) => n.stage === 'House').length };
  });
  expect(info).toEqual({ stage: 'City', houses: 48 });
  await page.screenshot({ path: 'tests/gpu/out/city-netted-t1.png' });
  expect(bad).toEqual([]);
});

test('6 x 8 city at Φ mixed: streets 4–6 left at the Door have drifted, 1–3 are crisp', async ({ page }) => {
  const bad: string[] = [];
  await open(page, bad);
  const phi = await page.evaluate(async () => {
    const a = (window as unknown as { __app: Hook }).__app;
    await a.stepTo(1);
    await a.command({ decision: 'zoom', stage: 1 });
    await a.step(); await a.step();
    await a.command({ decision: 'zoom', stage: 2 });
    for (let i = 0; i < 12; i++) {
      for (const h of a.frame()!.state.held) if (/^S[123] /.test(h.node_name)) await a.command({ decision: 'approve', envelope: h.envelope });
      await a.step();
    }
    const t = a.frame()!.arrivedAt;
    for (const dt of [0.3, 0.8, 1.5]) a.render(t + dt);
    const houses = a.frame()!.state.nodes.filter((n) => n.stage === 'House');
    return { low: houses.filter((n) => n.confidence < 0.7).length, high: houses.filter((n) => n.confidence > 0.95).length, min: Math.min(...houses.map((n) => n.confidence)) };
  });
  expect(phi.low).toBe(24);
  expect(phi.high).toBe(24);
  // The Door is modal and holds 24 envelopes; hide the card for the picture of the city behind it.
  await page.addStyleTag({ content: 'dialog#door { display: none !important; }' });
  await page.screenshot({ path: 'tests/gpu/out/city-phi-mixed.png' });
  expect(bad).toEqual([]);
});
