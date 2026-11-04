import { existsSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Presence as WindowState } from '../../src/extension/filter';
import {
  FORGET_MS,
  FRESH_MS,
  HEARTBEAT_MS,
  folderBoard,
  Presence,
} from '../../src/extension/presence';

const away: WindowState = { focused: false, active: false };
const using: WindowState = { focused: true, active: true };
const idle: WindowState = { focused: true, active: false };

let folder: string;

/** A window of this computer whose own state the test sets; every window shares `folder`. */
function window(id: string) {
  let state = away;
  const presence = new Presence(folderBoard(folder), () => state, id, Date.now);
  presence.start();
  return {
    presence,
    set(next: WindowState) {
      state = next;
      presence.changed();
    },
  };
}

describe('Presence', () => {
  beforeEach(() => {
    // From the real time: the files' own times come from the real clock.
    vi.useFakeTimers({ now: Date.now() });
    folder = join(mkdtempSync(join(tmpdir(), 'nightping-presence-')), 'presence');
  });
  afterEach(() => {
    vi.useRealTimers();
    rmSync(join(folder, '..'), { recursive: true, force: true });
  });

  it('counts the user as present when they work in another window', () => {
    const holder = window('holder');
    const other = window('other');
    other.set(using);
    expect(holder.presence.state()).toEqual(using);
  });

  it('counts the user as away when the focused window is idle or nothing is focused', () => {
    const holder = window('holder');
    const other = window('other');
    other.set(idle);
    expect(holder.presence.state()).toEqual(away);
    other.set(away);
    expect(holder.presence.state()).toEqual(away);
  });

  it('keeps its own state when the user is at this window, or only this window is idle', () => {
    const holder = window('holder');
    holder.set(using);
    expect(holder.presence.state()).toEqual(using);
    holder.set(idle);
    // Its own record does not count as another window.
    expect(holder.presence.state()).toEqual(idle);
  });

  it('stays right when the window that gets the focus hears of it first', () => {
    // As VS Code does it: the new window is focused before the old one loses the focus.
    const a = window('a');
    const b = window('b');
    a.set(using);
    b.set(using);
    a.set(away);
    expect(a.presence.state()).toEqual(using);
    expect(b.presence.state()).toEqual(using);
  });

  it('writes itself again while focused, so it keeps counting', () => {
    const holder = window('holder');
    const other = window('other');
    other.set(using);
    vi.advanceTimersByTime(FRESH_MS * 3);
    expect(holder.presence.state()).toEqual(using);
  });

  it('forgets a window that crashed while focused', () => {
    const holder = window('holder');
    // What such a window leaves behind: its last record, and no heartbeat.
    writeFileSync(join(folder, 'gone.json'), JSON.stringify({ ...using, at: Date.now() }));
    expect(holder.presence.state()).toEqual(using);
    vi.advanceTimersByTime(FRESH_MS + HEARTBEAT_MS);
    expect(holder.presence.state()).toEqual(away);
  });

  it('removes its file and stops writing when the window closes', () => {
    const holder = window('holder');
    const other = window('other');
    other.set(using);
    other.presence.dispose();
    vi.advanceTimersByTime(HEARTBEAT_MS * 2);
    expect(readdirSync(folder)).toEqual(['holder.json']);
    expect(holder.presence.state()).toEqual(away);
  });

  it('removes the files of windows gone for a day when it starts', () => {
    window('first');
    const old = join(folder, 'old.json');
    writeFileSync(old, JSON.stringify({ ...using, at: 0 }));
    const day = (Date.now() - FORGET_MS - 60_000) / 1000;
    utimesSync(old, day, day);
    writeFileSync(join(folder, 'recent.json'), JSON.stringify({ ...away, at: Date.now() }));
    window('second');
    expect(existsSync(old)).toBe(false);
    expect(readdirSync(folder).sort()).toEqual(['first.json', 'recent.json', 'second.json']);
  });

  it('ignores a record it cannot read, and a folder that is not there', () => {
    const holder = window('holder');
    for (const text of ['present', '5', '{"focused":true,"active":"yes","at":1}', '{']) {
      writeFileSync(join(folder, 'x.json'), text);
      expect(holder.presence.state(), text).toEqual(away);
    }
    rmSync(folder, { recursive: true, force: true });
    expect(holder.presence.state()).toEqual(away);
  });
});
