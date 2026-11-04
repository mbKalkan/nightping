// Codex's side: what its hooks send, the hooks Nightping writes to hooks.json, and the hook
// command itself, run in the shells Codex uses against a real endpoint.
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readCodexHook } from '../../src/extension/codex/payload';
import { CODEX_EVENTS, codexCommands, codexHooks } from '../../src/extension/codex/settings';
import { Endpoint } from '../../src/extension/endpoint';
import {
  connectedText,
  disconnectedText,
  hookSettings,
  hooksState,
} from '../../src/extension/hookFile';
import { freePort, runWithStdin, until } from './support';

const CURL = path.win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'curl.exe');
const spec = codexHooks(CURL);

describe('readCodexHook', () => {
  const common = { session_id: 's1', turn_id: 't1', cwd: '/home/me/shop', model: 'gpt' };

  it('starts a turn on a prompt and ends it on Stop, with the reply', () => {
    expect(
      readCodexHook({ ...common, hook_event_name: 'UserPromptSubmit', prompt: 'Rename foo' }),
    ).toEqual({ kind: 'prompt', session: 's1' });
    expect(
      readCodexHook({
        ...common,
        hook_event_name: 'Stop',
        stop_hook_active: false,
        last_assistant_message: 'Renamed foo to bar.',
      }),
    ).toEqual({ kind: 'stop', session: 's1', cwd: '/home/me/shop', reply: 'Renamed foo to bar.' });
  });

  it('says what Codex asks approval for: its description, else the command', () => {
    const ask = (tool_input: unknown) =>
      readCodexHook({
        ...common,
        hook_event_name: 'PermissionRequest',
        tool_name: 'Bash',
        tool_input,
      });
    expect(ask({ command: 'npm test', description: 'Run the tests' })).toEqual({
      kind: 'needs',
      session: 's1',
      cwd: '/home/me/shop',
      need: 'approval',
      message: 'Run the tests',
    });
    expect(ask({ command: 'npm test' })).toMatchObject({ message: 'npm test' });
    expect(ask(null)).toMatchObject({ message: 'Bash' });
  });

  it('ignores other events and anything that is not a hook payload', () => {
    expect(readCodexHook({ ...common, hook_event_name: 'PreToolUse' })).toBeUndefined();
    expect(readCodexHook({ ...common, hook_event_name: 'SubagentStop' })).toBeUndefined();
    expect(readCodexHook('Stop')).toBeUndefined();
    expect(readCodexHook(null)).toBeUndefined();
    expect(readCodexHook([])).toBeUndefined();
  });

  it('keeps only text of a reasonable size', () => {
    const hook = readCodexHook({
      hook_event_name: 'Stop',
      session_id: 7,
      cwd: 'x'.repeat(5000),
      last_assistant_message: '   ',
    });
    expect(hook).toEqual({
      kind: 'stop',
      session: 'default',
      cwd: 'x'.repeat(1000),
      reply: undefined,
    });
  });
});

describe('Codex hooks.json', () => {
  it('adds one async command hook per event, for both kinds of shell', () => {
    const file = JSON.parse(connectedText(spec, undefined, 47391)) as {
      hooks: Record<string, { hooks: Record<string, unknown>[] }[]>;
    };
    expect(Object.keys(file.hooks)).toEqual([...CODEX_EVENTS]);
    const [hook] = file.hooks.Stop[0].hooks;
    expect(hook).toEqual({
      type: 'command',
      command:
        'curl -s -m 5 -H "Content-Type: application/json" --data-binary "@-" http://127.0.0.1:47391/nightping/codex',
      commandWindows: `${CURL} -s -m 5 -H "Content-Type: application/json" --data-binary "@-" http://127.0.0.1:47391/nightping/codex`,
      timeout: 10,
      async: true,
    });
    expect(hooksState(spec, JSON.stringify(file), 47391)).toBe('connected');
    expect(hooksState(spec, JSON.stringify(file), 47000)).toBe('outdated');
  });

  it('leaves the user’s own hooks and keys as they are', () => {
    const own = {
      description: 'my hooks',
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }],
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'guard' }] }],
      },
    };
    const text = `${JSON.stringify(own, null, 4)}\n`;
    const connected = connectedText(spec, text, 47391);
    expect(connected).toMatch(/^\{\n {4}"description"/);
    const parsed = JSON.parse(connected) as typeof own;
    expect(parsed.hooks.Stop[0]).toEqual(own.hooks.Stop[0]);
    expect(parsed.hooks.PreToolUse).toEqual(own.hooks.PreToolUse);
    expect(JSON.parse(disconnectedText(spec, connected))).toEqual(own);
    expect(hooksState(spec, text, 47391)).toBe('disconnected');
    expect(hooksState(spec, '{ not json', 47391)).toBe('invalid');
  });

  it('copies the same hooks it would add', () => {
    expect(hookSettings(spec, 47391)).toEqual(JSON.parse(connectedText(spec, undefined, 47391)));
  });

  it('knows its hook by either command', () => {
    const { command, commandWindows } = codexCommands(47391, CURL);
    expect(spec.portOf({ type: 'command', command })).toBe(47391);
    expect(spec.portOf({ type: 'command', commandWindows })).toBe(47391);
    expect(spec.portOf({ type: 'command', command: `${command}x` })).toBeUndefined();
    expect(spec.portOf({ type: 'http', url: 'http://127.0.0.1:47391/nightping/codex' })).toBe(
      undefined,
    );
  });
});

/** Shells Codex runs a command hook in: the session's shell, or COMSPEC when there is none. */
const SHELLS: Array<{ name: string; run: (command: string) => [string, string[]] }> =
  process.platform === 'win32'
    ? [
        {
          name: 'Windows PowerShell',
          run: (command) => ['powershell.exe', ['-NoProfile', '-Command', command]],
        },
        { name: 'cmd', run: (command) => ['cmd.exe', ['/d', '/s', '/c', `"${command}"`]] },
      ]
    : [{ name: 'sh', run: (command) => ['/bin/sh', ['-c', command]] }];

describe('the hook command', () => {
  const running: Endpoint[] = [];
  afterEach(() => {
    for (const endpoint of running.splice(0)) endpoint.stop();
  });

  for (const shell of SHELLS) {
    it(`forwards the payload unchanged from ${shell.name}`, async () => {
      const port = await freePort();
      const received: unknown[] = [];
      const endpoint = new Endpoint((agent, payload) => received.push({ agent, payload }));
      running.push(endpoint);
      endpoint.start(port);
      await until(() => endpoint.state.kind === 'listening');

      const { command, commandWindows } = codexCommands(port, CURL);
      const payload = {
        hook_event_name: 'Stop',
        session_id: 's1',
        cwd: 'C:\\Users\\me\\proje "x"',
        last_assistant_message: 'Bitti: çalışma ağacı temiz & testler geçti. 🎉',
      };
      const [file, args] = shell.run(process.platform === 'win32' ? commandWindows : command);
      const { code, stdout } = await runWithStdin(file, args, JSON.stringify(payload));
      expect(code).toBe(0);
      // Codex reads a hook's output; Nightping's prints nothing.
      expect(stdout).toBe('');
      await until(() => received.length === 1);
      expect(received).toEqual([{ agent: 'codex', payload }]);
    });
  }

  it('fails quietly when VS Code is closed, so Codex goes on', async () => {
    const port = await freePort();
    const { command, commandWindows } = codexCommands(port, CURL);
    const [file, args] = SHELLS[0].run(process.platform === 'win32' ? commandWindows : command);
    const { code, stdout } = await runWithStdin(file, args, '{}');
    // curl cannot connect; an async hook's exit code changes nothing in Codex.
    expect(code).not.toBe(0);
    expect(stdout).toBe('');
  });
});
