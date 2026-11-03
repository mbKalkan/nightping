import { describe, expect, it } from 'vitest';
import type { FinishedEvent } from '../../src/extension/events';
import { decide, type Presence } from '../../src/extension/filter';
import { DEFAULT_PREFS } from '../../src/extension/prefs';
import type { NotifyPrefs } from '../../src/shared/protocol';

const away: Presence = { focused: false, active: false };
const atDesk: Presence = { focused: true, active: true };
const task = (exitCode: number | undefined, seconds: number): FinishedEvent => ({
  kind: 'task',
  name: 'build',
  exitCode,
  durationMs: seconds * 1000,
});

describe('decide', () => {
  it('sends a long run that finishes while the user is away', () => {
    expect(decide(task(0, 30), DEFAULT_PREFS, away)).toBe('send');
  });

  it('keeps a successful short run quiet, but not a failed one', () => {
    expect(decide(task(0, 29.9), DEFAULT_PREFS, away)).toBe('short');
    expect(decide(task(undefined, 5), DEFAULT_PREFS, away)).toBe('short');
    expect(decide(task(1, 1), DEFAULT_PREFS, away)).toBe('send');
  });

  it('stays quiet while the user is at this window', () => {
    expect(decide(task(1, 600), DEFAULT_PREFS, atDesk)).toBe('present');
    // Another window has focus, or this one has not been used for a while: the user may be gone.
    expect(decide(task(1, 600), DEFAULT_PREFS, { focused: false, active: true })).toBe('send');
    expect(decide(task(1, 600), DEFAULT_PREFS, { focused: true, active: false })).toBe('send');
    const always: NotifyPrefs = { ...DEFAULT_PREFS, onlyWhenAway: false };
    expect(decide(task(1, 600), always, atDesk)).toBe('send');
  });

  it('sends nothing for a kind of run that is turned off', () => {
    const noTasks: NotifyPrefs = {
      ...DEFAULT_PREFS,
      sources: { ...DEFAULT_PREFS.sources, task: false },
    };
    expect(decide(task(1, 600), noTasks, away)).toBe('off');
  });

  it('sends every run when the minimum is zero', () => {
    const every: NotifyPrefs = { ...DEFAULT_PREFS, minimumSeconds: 0 };
    expect(decide(task(0, 0), every, away)).toBe('send');
  });
});
