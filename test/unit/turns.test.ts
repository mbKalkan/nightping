import { describe, expect, it } from 'vitest';
import { Turns } from '../../src/extension/turns';

describe('Turns', () => {
  it('times a turn from its prompt, per session, and names the folder', () => {
    let now = 1_000;
    const turns = new Turns(() => now);
    expect(turns.event('codex', { kind: 'prompt', session: 'a' })).toBeUndefined();
    now = 61_000;
    expect(
      turns.event('codex', { kind: 'stop', session: 'a', cwd: '/home/me/shop', reply: 'Done.' }),
    ).toEqual({
      kind: 'codex',
      state: 'finished',
      durationMs: 60_000,
      folder: 'shop',
      reply: 'Done.',
      detail: undefined,
    });
    // The turn is over: another stop has no start to measure from.
    expect(
      turns.event('codex', { kind: 'stop', session: 'a', cwd: undefined, reply: undefined }),
    ).toMatchObject({ durationMs: undefined, folder: undefined });
  });

  it('passes on what the agent waits for', () => {
    const turns = new Turns(() => 0);
    expect(
      turns.event('claude', {
        kind: 'needs',
        session: 'a',
        cwd: 'C:\\work\\app',
        need: 'approval',
        message: 'Run the tests',
      }),
    ).toMatchObject({ kind: 'claude', state: 'approval', folder: 'app', detail: 'Run the tests' });
  });
});
