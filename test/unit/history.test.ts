import { describe, expect, it, vi } from 'vitest';
import { History, HISTORY_LIMIT, type Store } from '../../src/extension/history';

function memoryStore(initial?: unknown): Store {
  const values = new Map<string, unknown>();
  if (initial !== undefined) values.set('nightping.history', initial);
  return {
    get: <T>(key: string, fallback: T) => (values.has(key) ? (values.get(key) as T) : fallback),
    update: async (key, value) => void values.set(key, value),
  };
}

const entry = (time: number) => ({ time, title: 'Build', message: 'failed' });

describe('History', () => {
  it('starts empty and keeps the newest first', async () => {
    const history = new History(memoryStore());
    expect(history.entries()).toEqual([]);
    await history.add(entry(1));
    await history.add({ ...entry(2), error: 'Could not reach https://ntfy.example.com.' });
    expect(history.entries().map((e) => e.time)).toEqual([2, 1]);
    expect(history.entries()[0].error).toContain('Could not reach');
  });

  it(`keeps only the last ${HISTORY_LIMIT}`, async () => {
    const history = new History(memoryStore());
    for (let time = 1; time <= HISTORY_LIMIT + 5; time++) await history.add(entry(time));
    const times = history.entries().map((e) => e.time);
    expect(times).toHaveLength(HISTORY_LIMIT);
    expect(times[0]).toBe(HISTORY_LIMIT + 5);
    expect(times.at(-1)).toBe(6);
  });

  it('clears everything', async () => {
    const history = new History(memoryStore([entry(1)]));
    await history.clear();
    expect(history.entries()).toEqual([]);
  });

  it('reads a damaged store as empty', () => {
    expect(new History(memoryStore('not a list')).entries()).toEqual([]);
  });

  it('tells listeners after each change, until they stop listening', async () => {
    const history = new History(memoryStore());
    const listener = vi.fn();
    const subscription = history.onDidChange(listener);
    await history.add(entry(1));
    await history.clear();
    expect(listener).toHaveBeenCalledTimes(2);
    subscription.dispose();
    await history.add(entry(2));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
