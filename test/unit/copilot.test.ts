// GitHub Copilot's side: what its hooks send (as VS Code and Copilot CLI document and ship them),
// the hooks file Nightping writes, and the hook command itself, run the way VS Code runs it
// against a real endpoint.
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readHook } from '../../src/extension/claude/payload';
import {
  COPILOT_EVENTS,
  copilotCommands,
  copilotHooks,
} from '../../src/extension/copilot/settings';
import { Endpoint } from '../../src/extension/endpoint';
import {
  connectedText,
  disconnectedText,
  hookSettings,
  hooksState,
} from '../../src/extension/hookFile';
import { freePort, runWithStdin, until } from './support';

const SYSTEM_ROOT = process.env.SystemRoot ?? 'C:\\Windows';
const CURL = path.win32.join(SYSTEM_ROOT, 'System32', 'curl.exe');
const spec = copilotHooks(CURL);

describe('what Copilot’s hooks send', () => {
  // VS Code's agent mode: the same fields for every event, plus the prompt or stop flag.
  const vscode = {
    timestamp: '2026-11-04T10:00:00.000Z',
    session_id: 'vs1',
    transcript_path: '/home/me/.vscode/transcripts/vs1.jsonl',
    cwd: '/home/me/shop',
  };

  it('starts a turn on a prompt and ends it on Stop, in VS Code and in Copilot CLI', () => {
    expect(
      readHook({ ...vscode, hook_event_name: 'UserPromptSubmit', prompt: 'Rename foo' }),
    ).toEqual({ kind: 'prompt', session: 'vs1' });
    expect(readHook({ ...vscode, hook_event_name: 'Stop', stop_hook_active: false })).toEqual({
      kind: 'stop',
      session: 'vs1',
      cwd: '/home/me/shop',
      reply: undefined,
    });
    // Copilot CLI with the PascalCase name: snake_case fields and a stop reason.
    expect(
      readHook({
        hook_event_name: 'Stop',
        session_id: 'cli1',
        timestamp: '2026-11-04T10:00:00.000Z',
        cwd: '/home/me/shop',
        transcript_path: '/home/me/.copilot/session-state/cli1.jsonl',
        stop_reason: 'end_turn',
        stop_hook_active: false,
      }),
    ).toMatchObject({ kind: 'stop', session: 'cli1' });
  });

  it('says when Copilot CLI waits for approval or for an answer', () => {
    // `notification` mixes camelCase and snake_case.
    const notification = {
      sessionId: 'cli1',
      timestamp: 1_793_000_000_000,
      cwd: '/home/me/shop',
      hook_event_name: 'Notification',
      title: 'Permission needed',
    };
    expect(
      readHook({
        ...notification,
        notification_type: 'permission_prompt',
        message: 'Copilot wants to run npm test',
      }),
    ).toMatchObject({
      kind: 'needs',
      cwd: '/home/me/shop',
      need: 'approval',
      message: 'Copilot wants to run npm test',
    });
    expect(
      readHook({ ...notification, notification_type: 'elicitation_dialog', message: 'Which?' }),
    ).toMatchObject({ kind: 'needs', need: 'question' });
    for (const type of ['agent_idle', 'agent_completed', 'shell_completed']) {
      expect(readHook({ ...notification, notification_type: type }), type).toBeUndefined();
    }
  });
});

describe('Nightping’s Copilot hooks file', () => {
  const ours = (port: number) => ({
    type: 'command',
    bash: `curl -s --connect-timeout 0.5 -m 5 -H "Content-Type: application/json" --data-binary "@-" http://127.0.0.1:${port}/nightping/copilot || true`,
    powershell: `${CURL} -s --connect-timeout 0.5 -m 5 -H "Content-Type: application/json" --data-binary "@-" http://127.0.0.1:${port}/nightping/copilot; exit 0`,
    timeoutSec: 10,
  });

  it('is version 1, with one command hook per event for both kinds of shell', () => {
    const file = JSON.parse(connectedText(spec, undefined, 47391)) as unknown;
    expect(file).toEqual({
      version: 1,
      hooks: { UserPromptSubmit: [ours(47391)], Stop: [ours(47391)], notification: [ours(47391)] },
    });
    expect(Object.keys((file as { hooks: object }).hooks)).toEqual([...COPILOT_EVENTS]);
    expect(hooksState(spec, JSON.stringify(file), 47391)).toBe('connected');
    expect(hooksState(spec, JSON.stringify(file), 47000)).toBe('outdated');
    expect(hooksState(spec, '{ "version": 1, "hooks": {} }', 47391)).toBe('disconnected');
    expect(hooksState(spec, undefined, 47391)).toBe('disconnected');
  });

  it('copies the same file it would write', () => {
    expect(hookSettings(spec, 47391)).toEqual(JSON.parse(connectedText(spec, undefined, 47391)));
  });

  it('replaces its hooks for another port and leaves any other hook alone', () => {
    const someone = { type: 'command', bash: 'say done', powershell: 'echo done' };
    const old = JSON.parse(connectedText(spec, undefined, 47000)) as {
      hooks: Record<string, unknown[]>;
    };
    old.hooks.Stop.unshift(someone);
    const text = JSON.stringify(old, null, 2);
    const updated = connectedText(spec, text, 47391);
    expect(hooksState(spec, updated, 47391)).toBe('connected');
    expect((JSON.parse(updated) as typeof old).hooks.Stop).toEqual([someone, ours(47391)]);
    expect(JSON.parse(disconnectedText(spec, updated))).toEqual({
      version: 1,
      hooks: { Stop: [someone] },
    });
  });

  it('knows its hook by either command', () => {
    const { bash, powershell } = copilotCommands(47391, CURL);
    expect(spec.portOf({ type: 'command', bash })).toBe(47391);
    expect(spec.portOf({ type: 'command', powershell })).toBe(47391);
    expect(spec.portOf({ type: 'command', bash: bash.replace('copilot', 'copilotx') })).toBe(
      undefined,
    );
    expect(
      spec.portOf({ type: 'command', bash: 'curl http://127.0.0.1:47391/nightping/codex' }),
    ).toBeUndefined();
    expect(spec.portOf({ type: 'http', url: 'http://127.0.0.1:47391/nightping/copilot' })).toBe(
      undefined,
    );
  });
});

/** How VS Code runs a hook: Windows PowerShell when the system shell is cmd, else sh. */
function asVsCode(command: { bash: string; powershell: string }): [string, string[]] {
  return process.platform === 'win32'
    ? [
        path.win32.join(SYSTEM_ROOT, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
        ['-ExecutionPolicy', 'Bypass', '-NoProfile', '-NoLogo', '-Command', command.powershell],
      ]
    : ['/bin/sh', ['-c', command.bash]];
}

describe('the hook command', () => {
  const running: Endpoint[] = [];
  afterEach(() => {
    for (const endpoint of running.splice(0)) endpoint.stop();
  });

  it('forwards the payload unchanged and prints nothing', async () => {
    const port = await freePort();
    const received: unknown[] = [];
    const endpoint = new Endpoint((agent, payload) => received.push({ agent, payload }));
    running.push(endpoint);
    endpoint.start(port);
    await until(() => endpoint.state.kind === 'listening');

    const payload = {
      hook_event_name: 'Stop',
      session_id: 's1',
      cwd: 'C:\\Users\\me\\proje "x"',
      stop_reason: 'Bitti: çalışma ağacı temiz & testler geçti. 🎉',
    };
    const [file, args] = asVsCode(copilotCommands(port, CURL));
    const { code, stdout } = await runWithStdin(file, args, JSON.stringify(payload));
    expect(code).toBe(0);
    // Copilot reads a hook's output: an empty one changes nothing.
    expect(stdout).toBe('');
    await until(() => received.length === 1);
    expect(received).toEqual([{ agent: 'copilot', payload }]);
  });

  it('succeeds quietly and soon when VS Code is closed, so Copilot goes on', async () => {
    const port = await freePort();
    const [file, args] = asVsCode(copilotCommands(port, CURL));
    const start = Date.now();
    const { code, stdout } = await runWithStdin(file, args, '{}');
    // VS Code's chat warns about a failed hook; Windows takes two seconds to refuse without
    // the connect timeout.
    expect(code).toBe(0);
    expect(stdout).toBe('');
    expect(Date.now() - start).toBeLessThan(2000);
  });
});
