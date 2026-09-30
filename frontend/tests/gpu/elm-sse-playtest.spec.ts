// Four real phones and a TV share one native engine; all decisions are real button clicks.
import { expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

test('a LAN week: four phone answers, disconnect recovery, and Notes on all five views', async ({ browser, request }) => {
  const child = spawn(resolve('../engine/target/debug/serve'), [
    '--scenario', 'street', '--names', 'Ada,Ben,Cal,Dee', '--week', '40',
    '--price-walk', '--oracle', 'person', '--interval-ms', '300', '--port', '0',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  const contexts = [];
  const errors: string[] = [];
  try {
    const engine = await new Promise<string>((yes, no) => {
      child.once('error', no);
      child.stdout!.on('data', (data) => { const match = String(data).match(/listening on (http:\/\/\S+)/); if (match) yes(match[1]); });
      child.once('exit', (code) => { if (code !== null) no(new Error(`serve exited ${code}`)); });
    });
    await request.post(`${engine}/pause`);
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    const tv = await tvContext.newPage();
    tv.on('pageerror', (err) => errors.push(String(err)));
    await tv.goto(`/?source=sse&view=tv&engine=${encodeURIComponent(engine)}&quality=balanced`);
    const phones = [];
    for (const name of ['Ada', 'Ben', 'Cal', 'Dee']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      contexts.push(context);
      const page = await context.newPage();
      page.on('pageerror', (err) => errors.push(String(err)));
      const url = `/?source=sse&house=${name}&engine=${encodeURIComponent(engine)}`;
      await page.goto(url);
      await expect(page.locator('#phone h1')).toHaveText(name);
      phones.push({ page, url, name, asked: false, left: false });
    }
    await request.post(`${engine}/resume`);
    const clicks = { send: 0, hire: 0, oracle: 0, leave: 0 };
    let disconnected = false;
    const deadline = Date.now() + 35_000;
    while (Date.now() < deadline) {
      const state = await (await request.get(`${engine}/state`)).json();
      if (state.tick >= 40) break;
      for (const phone of phones) {
        const card = phone.page.locator('#phone .door-card');
        if (await card.count() === 0) continue;
        if (phone.name === 'Cal' && phone.asked && await phone.page.locator('section.oracle .asking').count()) continue;
        let choice: keyof typeof clicks;
        if (phone.name === 'Cal' && !phone.asked) choice = 'oracle';
        else if (phone.name === 'Dee' && !phone.left) choice = 'leave';
        else choice = phone.name === 'Ben' || phone.name === 'Cal' ? 'hire' : 'send';
        const button = card.locator(`button.${choice}`);
        if (await button.count() && await button.isEnabled()) {
          try { await button.click({ timeout: 500 }); }
          catch (err) { if (Date.now() >= deadline) throw err; continue; }
          clicks[choice]++;
          if (choice === 'oracle') phone.asked = true;
          if (choice === 'leave') phone.left = true;
        }
      }
      if (state.tick >= 16 && !disconnected) {
        disconnected = true;
        await phones[0].page.goto('about:blank'); // close an active SSE subscription mid-week
        await phones[0].page.goto(phones[0].url);
        await expect(phones[0].page.locator('#phone h1')).toHaveText('Ada');
      }
      await new Promise((done) => setTimeout(done, 25));
    }
    expect(disconnected).toBe(true);
    for (const n of Object.values(clicks)) expect(n).toBeGreaterThan(0);
    await expect(tv.locator('#notes .note-sheet')).toHaveCount(4);
    await expect(tv.locator('#notes')).toBeVisible();
    await tv.screenshot({ path: 'tests/gpu/out/sse-tv-friday.png' });
    for (const phone of phones) {
      await expect(phone.page.locator('#phone .note-sheet')).toContainText('The week’s Note');
      await phone.page.screenshot({ path: `tests/gpu/out/sse-phone-${phone.name.toLowerCase()}-friday.png` });
    }
    const state = await (await request.get(`${engine}/state`)).json();
    const notes = state.nodes.filter((n: { stage: string }) => n.stage === 'House').map((n: { note: { week: { pieces_done: number } } }) => n.note.week);
    expect(notes.some((n: { pieces_done: number }) => n.pieces_done > 0)).toBe(true);
    console.log('real clicks:', clicks, 'Friday pieces:', notes.map((n: { pieces_done: number }) => n.pieces_done));
    expect(errors).toEqual([]);
  } finally {
    for (const context of contexts) await context.close();
    child.kill();
  }
});
