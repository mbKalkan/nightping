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
    expect(decide(task(0, 30), DEFAULT_PREFS, away, false)).toBe('send');
  });

  it('keeps a successful short run quiet, but not a failed one', () => {
    expect(decide(task(0, 29.9), DEFAULT_PREFS, away, false)).toBe('short');
    expect(decide(task(undefined, 5), DEFAULT_PREFS, away, false)).toBe('short');
    expect(decide(task(1, 1), DEFAULT_PREFS, away, false)).toBe('send');
  });

  it('stays quiet while the user is at this window', () => {
    expect(decide(task(1, 600), DEFAULT_PREFS, atDesk, false)).toBe('present');
    // Another window has focus, or this one has not been used for a while: the user may be gone.
    expect(decide(task(1, 600), DEFAULT_PREFS, { focused: false, active: true }, false)).toBe(
      'send',
    );
    expect(decide(task(1, 600), DEFAULT_PREFS, { focused: true, active: false }, false)).toBe(
      'send',
    );
    const always: NotifyPrefs = { ...DEFAULT_PREFS, onlyWhenAway: false };
    expect(decide(task(1, 600), always, atDesk, false)).toBe('send');
  });

  it('sends nothing for a kind of run that is turned off', () => {
    const noTasks: NotifyPrefs = {
      ...DEFAULT_PREFS,
      sources: { ...DEFAULT_PREFS.sources, task: false },
    };
    expect(decide(task(1, 600), noTasks, away, false)).toBe('off');
  });

  it('sends an agent waiting for the user at once, and a turn of unknown length', () => {
    const claude = (state: 'finished' | 'approval', durationMs: number | undefined) =>
      ({
        kind: 'claude',
        state,
        durationMs,
        folder: undefined,
        reply: undefined,
        detail: undefined,
      }) as const;
    expect(decide(claude('approval', undefined), DEFAULT_PREFS, away, false)).toBe('send');
    expect(decide(claude('finished', undefined), DEFAULT_PREFS, away, false)).toBe('send');
    expect(decide(claude('finished', 5_000), DEFAULT_PREFS, away, false)).toBe('short');
    expect(decide(claude('approval', undefined), DEFAULT_PREFS, atDesk, false)).toBe('present');
  });

  it('sends nothing while notifications are paused', () => {
    expect(decide(task(1, 600), DEFAULT_PREFS, away, true)).toBe('paused');
  });

  it('sends every run when the minimum is zero', () => {
    const every: NotifyPrefs = { ...DEFAULT_PREFS, minimumSeconds: 0 };
    expect(decide(task(0, 0), every, away, false)).toBe('send');
  });
});
