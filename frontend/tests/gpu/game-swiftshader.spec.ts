// A Week on Elm Street on the real page (doc 06 §8): the phone's Door (?house=Ada, a phone-sized viewport) and the
// TV's Notes on the table at Friday's last tick (?view=tv), on the wasm game (engine_new_game, seed 7).

import { expect, test, type Page } from '@playwright/test';

type Held = { envelope: number; node: number; node_name: string; kind: string; task_id: string | null };
type Hook = {
  ready: boolean; stepTo(t: number): Promise<number>; step(): Promise<number>; render(at?: number): boolean;
  frame(): { tick: number; arrivedAt: number; state: { held: Held[]; nodes: { id: number; name: string; stage: string; note: unknown }[] } } | null;
  command(c: unknown): Promise<boolean>;
};

function watch(page: Page): string[] {
  const bad: string[] = [];
  page.on('console', (m) => { if (!/GPU stall due to ReadPixels/.test(m.text()) && /shader|GL_INVALID|WebGL|error/i.test(m.text()) && m.type() !== 'debug') bad.push(m.text()); });
  page.on('pageerror', (e) => bad.push(String(e)));
  return bad;
}

test('the phone view: Ada’s Door, the composed card after the oracle answered', async ({ page }) => {
  const bad = watch(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?source=wasm&run=game&houses=4&house=Ada&clock=manual');
  await page.waitForFunction(() => (window as unknown as { __app?: Hook }).__app?.ready, undefined, { timeout: 30_000 });
  await page.evaluate(async () => {
    const a = (window as unknown as { __app: Hook }).__app;
    for (let i = 0; i < 12 && !document.querySelector('#phone .door-card'); i++) await a.step();
  });
  const card = page.locator('#phone .door-card');
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Ask the oracle first (15 cr)' }).click();
  await page.evaluate(async () => { await (window as unknown as { __app: Hook }).__app.step(); });
  await expect(page.locator('#phone section.oracle')).toContainText('The oracle said the courier costs');
  await expect(card.getByRole('button')).toHaveText([/^Send it \(10\.0 cr\)$/, /^Hire (Ben|Cal|Dee)'s courier at 10\.0 cr$/, 'Ask the oracle first (15 cr)', 'Leave it on the table']);
  await expect(page.locator('#stage')).toBeHidden();
  await page.screenshot({ path: 'tests/gpu/out/phone-door.png' });
  expect(bad).toEqual([]);
});

test('the TV: the street with the cottages named, and on Friday the Notes on the table side by side', async ({ page }) => {
  const bad = watch(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?source=wasm&run=game&houses=4&week=40&view=tv&clock=manual&quality=balanced');
  await page.waitForFunction(() => (window as unknown as { __app?: Hook }).__app?.ready, undefined, { timeout: 30_000 });
  const tags = await page.evaluate(async () => {
    const a = (window as unknown as { __app: Hook }).__app;
    await a.stepTo(1);
    a.render(a.frame()!.arrivedAt + 1);
    return [...document.querySelectorAll('#labels .nametag')].map((e) => e.textContent);
  });
  expect(tags.sort()).toEqual(['Ada', 'Ben', 'Cal', 'Dee']);
  // A week at the table, each person their own way: Ada sends, Ben hires, Cal leaves every other draft and tops up
  // once, Dee asks the oracle each morning and then hires.
  const sheets = await page.evaluate(async () => {
    const a = (window as unknown as { __app: Hook }).__app;
    const asked = new Set<number>();
    let calKnocks = 0;
    for (let t = 1; t < 40; t++) {
      const f = a.frame()!;
      const byTask = new Map<string, Held[]>();
      for (const h of f.state.held) { const k = `${h.node}:${h.task_id ?? h.envelope}`; byTask.set(k, [...(byTask.get(k) ?? []), h]); }
      for (const group of byTask.values()) {
        const who = group[0].node_name;
        const send = group.find((h) => h.kind === 'dispatch'), hire = group.find((h) => h.kind === 'hire_service');
        const pick = who === 'Ada' ? send : who === 'Ben' || who === 'Dee' ? hire ?? send : calKnocks++ % 2 === 0 ? send : undefined;
        const day = Math.floor((f.tick - 1) / 8);
        if (who === 'Dee' && !asked.has(day)) { asked.add(day); await a.command({ decision: 'sync', node: group[0].node }); continue; }
        for (const h of group) await a.command({ decision: h === pick ? 'approve' : 'reject', envelope: h.envelope });
      }
      if (t === 20) { const cal = f.state.nodes.find((n) => n.name === 'Cal')!; await a.command({ decision: 'top_up', node: cal.id, credits: 50 }); }
      await a.step();
    }
    const f = a.frame()!; // tick 40: Friday's last tick
    for (const dt of [0.2, 0.6, 1.0]) a.render(f.arrivedAt + dt);
    return [...document.querySelectorAll('#notes .note-sheet .who')].map((e) => e.textContent);
  });
  expect(sheets).toEqual(['Ada', 'Ben', 'Cal', 'Dee']);
  await expect(page.locator('#notes')).toBeVisible();
  await expect(page.locator('#notes')).toContainText('Friday evening · the Notes on the table');
  await page.screenshot({ path: 'tests/gpu/out/tv-notes.png' });
  expect(bad).toEqual([]);
});
