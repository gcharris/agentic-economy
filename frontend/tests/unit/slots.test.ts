import { describe, expect, test } from 'vitest';
import { SlotTable, TRUTH_SLOTS } from '../../src/engine/store/slots.ts';
import { loadTrace } from '../helpers/assets.ts';

describe('SlotTable (NodeId → slot, first-seen, never freed)', () => {
  test('allocates in first-seen order and never moves an id', () => {
    const t = new SlotTable();
    expect(t.size).toBe(0);
    expect(t.slotOf(3781345924436676)).toBe(0);
    expect(t.slotOf(3155115984088982)).toBe(1);
    expect(t.slotOf(3781345924436676)).toBe(0);
    expect(t.size).toBe(2);
    expect(t.idAt(1)).toBe(3155115984088982);
    expect(t.peek(42)).toBe(-1);
    expect(t.size).toBe(2); // peek never allocates
  });

  test('ensure() walks a node list and reports only the new slots; a node that leaves keeps its slot', () => {
    const t = new SlotTable();
    const street = loadTrace().street;
    expect(t.ensure(street[0].state.nodes)).toBe(8);
    expect(t.ensure(street[1].state.nodes)).toBe(0);
    expect(t.ensure(street[0].state.nodes.slice(0, 3))).toBe(0);
    expect(t.size).toBe(8);
    // ascending-id order in, ascending slots out
    street[0].state.nodes.forEach((n, i) => expect(t.slotOf(n.id)).toBe(i));
  });

  test('toArray() is NodeId per slot and adopt() accepts a matching worker table, refusing a divergent one', () => {
    const a = new SlotTable();
    a.slotOf(10); a.slotOf(20);
    const arr = a.toArray();
    expect(arr).toBeInstanceOf(Float64Array);
    expect([...arr]).toEqual([10, 20]);

    const b = new SlotTable();
    b.adopt(arr);
    expect(b.slotOf(20)).toBe(1);
    b.slotOf(30);
    expect(() => b.adopt(Float64Array.from([10, 20, 30, 40]))).not.toThrow();
    expect(b.slotOf(40)).toBe(3);
    expect(() => b.adopt(Float64Array.from([20, 10]))).toThrow(/divergence/);
  });

  test('the table is bounded by the texture (65,536 slots)', () => {
    expect(TRUTH_SLOTS).toBe(65536);
    const t = new SlotTable();
    for (let i = 0; i < 6000; i++) t.slotOf(i * 7 + 1);
    expect(t.size).toBe(6000);
  });
});
