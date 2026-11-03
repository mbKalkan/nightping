import { describe, expect, it } from 'vitest';
import {
  connectedText,
  disconnectedText,
  hookSettings,
  hooksState,
  hookUrl,
  InvalidSettings,
} from '../../src/extension/claude/settings';

const PORT = 47391;
const ours = (port = PORT) => ({
  hooks: [{ type: 'http', url: hookUrl(port), timeout: 5 }],
});

/** A user's settings with other hooks and settings that must survive. */
const theirs = {
  model: 'opus',
  permissions: { allow: ['Bash(npm test)'] },
  hooks: {
    Stop: [{ hooks: [{ type: 'command', command: 'python notify.py' }] }],
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'guard.sh' }] }],
  },
};

describe('Claude Code settings', () => {
  it('adds a hook for each event, next to the user’s own', () => {
    const text = connectedText(JSON.stringify(theirs, null, 2), PORT);
    const settings = JSON.parse(text);
    expect(settings.model).toBe('opus');
    expect(settings.permissions).toEqual(theirs.permissions);
    expect(settings.hooks.PreToolUse).toEqual(theirs.hooks.PreToolUse);
    expect(settings.hooks.Stop).toEqual([...theirs.hooks.Stop, ours()]);
    expect(settings.hooks.UserPromptSubmit).toEqual([ours()]);
    expect(settings.hooks.Notification).toEqual([ours()]);
    expect(hooksState(text, PORT)).toBe('connected');
  });

  it('connects a missing or empty file', () => {
    for (const text of [undefined, '', '  \n']) {
      expect(JSON.parse(connectedText(text, PORT))).toEqual(hookSettings(PORT));
    }
  });

  it('connects once, however often it is asked, and moves to a new port', () => {
    const once = connectedText(undefined, PORT);
    expect(connectedText(once, PORT)).toBe(once);
    const moved = connectedText(once, 50000);
    expect(JSON.parse(moved).hooks.Stop).toEqual([ours(50000)]);
    expect(hooksState(moved, 50000)).toBe('connected');
  });

  it('removes only its own hooks, and what they leave empty', () => {
    const connected = connectedText(JSON.stringify(theirs), PORT);
    expect(JSON.parse(disconnectedText(connected))).toEqual(theirs);
    expect(JSON.parse(disconnectedText(connectedText('{}', PORT)))).toEqual({});
    // A group that also holds someone else's hook keeps that hook.
    const shared = {
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'a' }, ...ours().hooks] }] },
    };
    expect(JSON.parse(disconnectedText(JSON.stringify(shared)))).toEqual({
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'a' }] }] },
    });
  });

  it('tells connected, outdated and disconnected apart', () => {
    expect(hooksState(undefined, PORT)).toBe('disconnected');
    expect(hooksState(JSON.stringify(theirs), PORT)).toBe('disconnected');
    expect(hooksState(connectedText(undefined, PORT), 50000)).toBe('outdated');
    const partial = { hooks: { Stop: [ours()] } };
    expect(hooksState(JSON.stringify(partial), PORT)).toBe('outdated');
  });

  it('leaves a file it cannot read alone', () => {
    for (const text of ['{ "model": "opus", }', '// comment\n{}', '[]', '"x"', '{"hooks": []}']) {
      expect(hooksState(text, PORT), text).toBe('invalid');
      expect(() => connectedText(text, PORT), text).toThrow(InvalidSettings);
      expect(() => disconnectedText(text), text).toThrow(InvalidSettings);
    }
  });

  it('keeps the file’s indentation and line ends', () => {
    const tabs = '{\r\n\t"model": "opus"\r\n}\r\n';
    const text = connectedText(tabs, PORT);
    expect(text.startsWith('{\r\n\t"model": "opus",\r\n\t"hooks": {')).toBe(true);
    expect(text.endsWith('}\r\n')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('reads a file that starts with a byte order mark', () => {
    expect(hooksState(`\uFEFF${connectedText(undefined, PORT)}`, PORT)).toBe('connected');
  });
});
