import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Store } from '../../src/extension/history';
import { activePause, isPauseMinutes, Pauser } from '../../src/extension/pause';

const MINUTE = 60_000;

function memory(): Store {
  const values = new Map<string, unknown>();
  return {
    get: <T>(key: string, fallback: T) => (values.has(key) ? (values.get(key) as T) : fallback),
    update: async (key, value) => void values.set(key, value),
  };
}

describe('activePause', () => {
  it('keeps a pause until its time, and one without a time until resumed', () => {
    expect(activePause({ until: 2000 }, 1000)).toEqual({ until: 2000 });
    expect(activePause({ until: 2000 }, 2000)).toBeUndefined();
    expect(activePause({}, 1000)).toEqual({});
  });

  it('ignores anything else', () => {
    for (const saved of [undefined, null, 'paused', 5, { until: '2000' }]) {
      expect(activePause(saved, 1000), JSON.stringify(saved)).toBeUndefined();
    }
  });
});

describe('isPauseMinutes', () => {
  it('takes a length from a minute up to a day', () => {
    expect(isPauseMinutes(1)).toBe(true);
    expect(isPauseMinutes(1440)).toBe(true);
    for (const value of [0, -5, 1441, Number.NaN, '30', undefined]) {
      expect(isPauseMinutes(value), String(value)).toBe(false);
    }
  });
});

describe('Pauser', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 3, 14, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('pauses for a while, then tells its listeners when the pause is over', async () => {
    const pauser = new Pauser(memory());
    const changes = vi.fn();
    pauser.onDidChange(changes);
    await pauser.pause(30);
    expect(pauser.current()).toEqual({ until: Date.now() + 30 * MINUTE });
    expect(changes).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30 * MINUTE + 100);
    expect(pauser.current()).toBeUndefined();
    expect(changes).toHaveBeenCalledTimes(2);
    pauser.dispose();
  });

  it('pauses until resumed', async () => {
    const pauser = new Pauser(memory());
    await pauser.pause();
    vi.advanceTimersByTime(24 * 60 * MINUTE);
    expect(pauser.current()).toEqual({});
    await pauser.resume();
    expect(pauser.current()).toBeUndefined();
    pauser.dispose();
  });

  it('sees a pause that another window wrote to the shared store', async () => {
    const store = memory();
    const other = new Pauser(store);
    const pauser = new Pauser(store);
    await other.pause(60);
    expect(pauser.current()).toEqual({ until: Date.now() + 60 * MINUTE });
    other.dispose();
    pauser.dispose();
  });
});
