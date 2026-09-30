// A Week on Elm Street, the phone (doc 06 §8.6) through the real UI on the real wasm (engine_new_game): the Door card
// composes the send and the hire for one draft; its answers reach the engine; the oracle answers on the phone; on
// Friday the phone and the TV show the week's Notes.

import { afterEach, beforeEach, expect, test } from 'vitest';
import { App } from '../../src/app/App.ts';
import { NullRenderer } from '../../src/app/Renderer.ts';
import { NOOP_UI } from '../../src/engine/store/Store.ts';
import { composeCards, resolveHouse, PhoneView } from '../../src/ui/phone.ts';
import { NotesTable } from '../../src/ui/notes.ts';
import { engineSource } from '../helpers/engineSource.ts';
import { loadShell } from '../helpers/assets.ts';

let app: App | null = null;
beforeEach(() => loadShell());
afterEach(() => { app?.dispose(); app = null; });

const BANNED = /\b(score|rank|reputation|leaderboard|rating)\b/i;

async function phone(key: string, game = { houses: 3, week: 40, priceWalk: false, oraclePerson: true }) {
  const source = engineSource('street', { game });
  app = await App.boot({ source, renderer: new NullRenderer(), root: document.body, clock: 'manual', ui: (a) => new PhoneView(document, key, a.command.bind(a), true) });
  return app;
}

async function untilCard(a: App, max = 12) {
  for (let i = 0; i < max; i++) {
    await a.step();
    if (document.querySelector('#phone .door-card')) return;
  }
  throw new Error('no knock at the Door');
}

const buttons = () => [...document.querySelectorAll<HTMLButtonElement>('#phone .door-card button')];

test('the card composes the send and the hire for one draft: four answers, the purse, the liquidity, the oracle', async () => {
  const a = await phone('Ada');
  await untilCard(a);
  const s = a.store.frame!.state;
  const ada = s.nodes.find((n) => n.name === 'Ada')!;
  const cards = composeCards(s, ada.id);
  expect(cards[0].send?.kind).toBe('dispatch');
  expect(cards[0].hire?.kind).toBe('hire_service');
  expect(cards[0].hire?.task_id).toBe(cards[0].send?.task_id);
  const neighbour = cards[0].hire!.target_name;
  expect(['Ben', 'Cal']).toContain(neighbour);
  expect(document.querySelectorAll('#phone .door-card')).toHaveLength(1);
  expect(buttons().map((b) => b.textContent)).toEqual([
    'Send it (10.0 cr)', `Hire ${neighbour}'s courier at 10.0 cr`, 'Ask the oracle first (15 cr)', 'Leave it on the table',
  ]);
  const text = document.querySelector('#phone')!.textContent!;
  expect(text).toContain('The Porter is at the Door');
  expect(text).toContain(`The finished draft for ${cards[0].task}.`);
  expect(text).toContain('Nothing burns while you decide.');
  expect(text).toContain(`purse ${ada.compute.toFixed(2)} / 800.00 cr`);
  expect(text).toContain('liquidity 200.00 cr');
  expect(text).toContain('You have not asked the oracle this week.');
  expect(document.querySelector('#phone h1')!.textContent).toBe('Ada');
  expect(document.body.textContent).not.toMatch(BANNED);
});

test('"Hire" atomically selects the hire and withdraws the send; the swap settles at the kerb and the draft is done', async () => {
  const a = await phone('1'); // the first house in the order of the names: Ada
  await untilCard(a);
  const s = a.store.frame!.state;
  const ada = s.nodes.find((n) => n.name === 'Ada')!;
  const card = composeCards(s, ada.id)[0];
  buttons()[1].click();
  await Promise.resolve();
  expect(document.querySelector('#phone .door-card .sent')!.textContent).toBe('sent to the Door…');
  expect(buttons().every((b) => b.disabled)).toBe(true);
  const f1 = (await a.step())!;
  expect(f1.events.some((e) => e.type === 'REJECTED' && e.envelope === card.send!.envelope && e.gate === 'House')).toBe(false);
  expect(f1.events.some((e) => e.type === 'APPROVED' && e.envelope === card.hire!.envelope && e.gate === 'House')).toBe(true);
  const f2 = (await a.step())!;
  expect(f2.events.some((e) => e.type === 'SETTLED' && e.envelope === card.hire!.envelope)).toBe(true);
  expect(f2.events.some((e) => e.type === 'DELIVERED' && e.envelope === card.hire!.envelope)).toBe(true);
  expect(f2.state.nodes.find((n) => n.id === ada.id)!.liquidity_truth).toBe(200 - card.hire!.believed_price!);
});

test('"Ask the oracle first" asks, keeps the card, and the answer comes back on the phone', async () => {
  const a = await phone('ada');
  await untilCard(a);
  const task = composeCards(a.store.frame!.state, a.store.frame!.state.nodes.find((n) => n.name === 'Ada')!.id)[0].task;
  const ask = buttons()[2];
  ask.click();
  await Promise.resolve();
  expect(document.querySelector('#phone section.oracle .asking')).not.toBeNull();
  const f = (await a.step())!;
  const ada = f.state.nodes.find((n) => n.name === 'Ada')!;
  expect(f.events.some((e) => e.type === 'STATE_SYNC' && e.node === ada.id && e.cost === 15)).toBe(true);
  expect(ada.oracle_price).toBe(10);
  expect(document.querySelector('#phone section.oracle')!.textContent).toBe(`The oracle said the courier costs 10.0 cr (Monday · tick ${f.tick} of 8).`);
  expect(document.querySelector('#phone .door-card .what')!.textContent).toBe(`The finished draft for ${task}.`); // the card comes back
  expect(buttons()[0].disabled).toBe(false);
});

test('Friday: the phone shows its week’s Note; the TV lays the Notes side by side, with no totals row', async () => {
  const source = engineSource('street', { game: { houses: 4, week: 6, priceWalk: true, oraclePerson: true } });
  const notes = new NotesTable(document);
  app = await App.boot({ source, renderer: new NullRenderer(), root: document.body, clock: 'manual', ui: NOOP_UI });
  const view = new PhoneView(document, 'Ben', app.command.bind(app), true);
  for (let t = 1; t <= 6; t++) {
    for (const h of app.store.frame?.state.held ?? []) await app.command({ decision: 'approve', envelope: h.envelope });
    const f = (await app.step())!;
    view.apply(f, app.store);
    notes.apply(f.state);
    expect(document.querySelector<HTMLElement>('#notes')!.hidden).toBe(t < 6);
  }
  const sheet = document.querySelector('#phone .note-sheet')!;
  expect(sheet.querySelector('h2')!.textContent).toBe('The week’s Note');
  expect(sheet.textContent).toMatch(/pieces done\d+ of 15/);
  const tv = [...document.querySelectorAll('#notes .note-sheet')];
  expect(tv.map((s) => s.querySelector('.who')!.textContent)).toEqual(['Ada', 'Ben', 'Cal', 'Dee']);
  for (const s of tv) expect(s.textContent).toContain('The week is over. The Note is on the table.');
  expect(document.querySelector('#notes')!.textContent).not.toMatch(/total/i);
  expect(document.body.textContent).not.toMatch(BANNED);
});


test('numbered phone URLs follow --names creation order, even for unsorted names', async () => {
  const a = await phone('1');
  await a.step();
  const state = a.store.frame!.state;
  const houses = state.nodes.filter((n) => n.stage === 'House').sort((a, b) => a.house_number! - b.house_number!);
  houses[0].name = 'Zoe'; houses[1].name = 'Ada'; houses[2].name = 'Ben';
  expect(resolveHouse(state, '1')?.name).toBe('Zoe');
  expect(resolveHouse(state, '2')?.name).toBe('Ada');
  expect(resolveHouse(state, 'ben')?.id).toBe(houses[2].id);
});


test('an unaffordable oracle is disabled; a refused command clears its pending state', async () => {
  const a = await phone('Ada');
  await untilCard(a);
  const frame = a.store.frame!;
  const ada = frame.state.nodes.find((n) => n.name === 'Ada')!;
  const view = new PhoneView(document, 'Ada', async () => false, true);
  ada.compute = 5;
  view.apply(frame, a.store);
  expect(buttons()[2].disabled).toBe(true);
  ada.compute = 100;
  view.apply(frame, a.store);
  buttons()[2].click();
  await Promise.resolve();
  expect(document.querySelector('section.oracle .asking')).toBeNull();
  expect(buttons()[2].disabled).toBe(false);
  view.apply(frame, a.store);
  expect(buttons()[2].disabled).toBe(false);
});

test('the phone sends one atomic command, acknowledges failure, and offers the finite pocket and close', async () => {
  const a = await phone('Ada'); await untilCard(a);
  const calls: Parameters<App['command']>[0][] = [];
  const view = new PhoneView(document, 'Ada', async (cmd) => { calls.push(cmd); return false; }, true);
  const frame = a.store.frame!; view.apply(frame, a.store);
  buttons()[1].click(); await Promise.resolve();
  expect(calls).toHaveLength(1); expect(calls[0]).toMatchObject({ decision: 'answer', answer: 'hire' });
  expect(document.querySelector('[role=alert]')?.textContent).toContain('refused');
  expect(buttons()[1].disabled).toBe(false);
  const pocket = [...document.querySelectorAll<HTMLButtonElement>('#phone .pocket button')];
  pocket[0].click(); await Promise.resolve();
  expect(calls[1]).toMatchObject({ decision: 'top_up', credits: 50 });
  pocket[1].click(); await Promise.resolve(); expect(calls[2]).toMatchObject({ decision: 'close' });
  const ada = frame.state.nodes.find((n) => n.name === 'Ada')!; ada.pocket_left = 0;
  view.apply(frame, a.store);
  expect(document.querySelector<HTMLButtonElement>('.pocket button')!.disabled).toBe(true);
});

test('a forty-eight tick week and ten-credit oracle are painted from game configuration', async () => {
  const source = engineSource('street', { game: { houses: 3, week: 48, priceWalk: true, oraclePerson: true, oracleCost: 10, cadence: 12 } });
  app = await App.boot({ source, renderer: new NullRenderer(), root: document.body, clock: 'manual', ui: (a) => new PhoneView(document, 'Ada', a.command.bind(a), true) });
  await untilCard(app); expect(buttons()[2].textContent).toBe('Ask the oracle first (10 cr)');
  expect(document.querySelector('#phone .day')!.textContent).toBe('Monday · tick 1 of 10');
  const frame = app.store.frame!; frame.state.tick = 48;
  new PhoneView(document, 'Ada', app.command.bind(app), true).apply(frame, app.store);
  expect(document.querySelector('#phone .day')!.textContent).toBe('Friday · tick 9 of 9');
  expect([...document.querySelectorAll<HTMLButtonElement>('.pocket button')].every((b) => b.disabled)).toBe(true);
});

test('a three-tick Porter walk hides the card, shows his return, and staff keep drafting', async () => {
 const source = engineSource('street', { game: { houses:3, week:40, priceWalk:false, oraclePerson:true, sendTicks:3 } });
 app = await App.boot({ source, renderer:new NullRenderer(), root:document.body, clock:'manual', ui:(a)=>new PhoneView(document,'Ada',a.command.bind(a),true) });
 await untilCard(app);expect(document.querySelector('.calm')!.textContent).toBe('Your staff keep drafting while you decide.');
 buttons()[0].click();await Promise.resolve();const f=(await app.step())!;
 expect(document.querySelector('.door-card')).toBeNull();expect(document.querySelector('#phone .pill')!.textContent).toContain('The Porter is out');
 expect(document.querySelector('#phone .pill')!.textContent).toContain('tick 4 of 8');
 expect(document.querySelector('.quiet')!.textContent).toContain('1 finished draft on the table');
 expect(f.state.nodes.find((n)=>n.name==='Ada')!.tasks_done).toBe(0);
 await app.step();expect(app.store.frame!.state.nodes.find((n)=>n.name==='Ada')!.tasks_done).toBe(1);expect(document.querySelector('.door-card')).toBeNull();
 await app.step();expect(document.querySelector('.door-card')).not.toBeNull();
 expect(document.querySelector('#phone .purse')!.textContent).toContain('Φ');
 const deferred = document.querySelector('.door-card .what')!.textContent;
 buttons()[3].click();await Promise.resolve();await app.step();
 expect(document.querySelector('.door-card .what')!.textContent).not.toBe(deferred);
 buttons()[0].click();await Promise.resolve();
 await app.step();await app.step();await app.step();
 expect(document.querySelector('.door-card .what')!.textContent).toBe(deferred);
});
