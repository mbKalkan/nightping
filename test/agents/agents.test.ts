// Real agent turns against Nightping's own endpoint, payload readers, turn timing and format:
// the check that Nightping understands what today's Claude Code and Codex really send. Each test
// runs one short turn on the account the agent is signed in with (a few tokens) and is skipped
// when that agent is not installed. The agents' own settings files are left alone: Claude Code
// loads no user settings and gets Nightping's hooks with --settings; Codex gets them with -c and,
// when asked for, runs them without stored trust for this run only. The approval test needs a
// terminal: it runs on Windows, after npm run test:smoke has downloaded VS Code, and once Claude
// Code's first-run setup is done; it trusts its own folder under the temp folder on first run.
//   npm run test:agents                          (Claude Code)
//   NIGHTPING_TEST_CODEX=1 npm run test:agents   (also Codex)
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readHook, type HookEvent } from '../../src/extension/claude/payload';
import { hookSettings as claudeHookSettings } from '../../src/extension/claude/settings';
import { readCodexHook } from '../../src/extension/codex/payload';
import { codexHooks } from '../../src/extension/codex/settings';
import { Endpoint, type Agent } from '../../src/extension/endpoint';
import type { AgentKind, FinishedEvent } from '../../src/extension/events';
import { formatEvent } from '../../src/extension/format';
import { hookSettings } from '../../src/extension/hookFile';
import { Turns } from '../../src/extension/turns';
import { claude, findCodex, findVsCode, listen, run, toml, windowsCurl, type Run } from './support';

const PORT = 47386;
const PROMPT = 'Reply with exactly the word pong and nothing else. Do not use any tools.';
const english = (message: string, ...args: Array<string | number>) =>
  message.replace(/\{(\d+)\}/g, (_, i: string) => String(args[Number(i)]));

/** What reached the endpoint, by agent path, and when. */
const received: { agent: Agent; payload: unknown; at: number }[] = [];
const endpoint = new Endpoint((agent, payload) =>
  received.push({ agent, payload, at: Date.now() }),
);
let folder: string;

beforeAll(async () => {
  await listen(endpoint, PORT);
  folder = mkdtempSync(join(tmpdir(), 'nightping-agent-'));
});

afterAll(() => {
  endpoint.stop();
  rmSync(folder, { recursive: true, force: true });
});

/** The hooks an agent posted while `start` ran, read and timed as the extension does. */
async function turn(
  agent: Agent,
  kind: AgentKind,
  read: (payload: unknown) => HookEvent | undefined,
  start: () => Promise<Run>,
) {
  received.length = 0;
  const result = await start();
  // Asynchronous hooks may still be on their way when the agent exits.
  for (let i = 0; i < 50 && !received.some((r) => read(r.payload)?.kind === 'stop'); i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const posts = received.filter((r) => r.agent === agent);
  // Timed as the extension times them: each when it arrived.
  let now = 0;
  const turns = new Turns(() => now);
  const events = posts
    .map((post) => {
      now = post.at;
      const hook = read(post.payload);
      return hook && turns.event(kind, hook);
    })
    .filter((event): event is FinishedEvent => event !== undefined);
  return { result, payloads: posts.map((post) => post.payload), events };
}

const vscode = findVsCode();
// Codex runs a new hook only once the user trusts it, so this run skips that check with
// --dangerously-bypass-hook-trust: only when the user asks for it.
const codex = process.env.NIGHTPING_TEST_CODEX === '1' ? findCodex() : undefined;

describe('real agent turns', () => {
  // Claude asks for approval only in an interactive session, so this one runs in a terminal:
  // pty.cjs, under the VS Code that the smoke tests download. It always uses the same folder, so
  // Claude asks only on the first run whether to trust it. Nobody approves; the session is
  // closed once the notification hook has come, so the file is never written.
  it.skipIf(!claude || !vscode)(
    'Claude Code: waiting for approval notifies that Claude needs you',
    async () => {
      const work = join(tmpdir(), 'nightping-agent-approval');
      rmSync(join(work, 'approval.txt'), { force: true });
      mkdirSync(work, { recursive: true });
      const settings = join(folder, 'claude-settings.json');
      writeFileSync(settings, JSON.stringify(claudeHookSettings(PORT)));
      const screen = join(folder, 'screen.txt');
      received.length = 0;
      const { code, pty } = vscode as { code: string; pty: string };
      const child = spawn(
        code,
        [
          fileURLToPath(new URL('./pty.cjs', import.meta.url)),
          pty,
          work,
          screen,
          claude as string,
          'Create a file named approval.txt that contains the word hi.',
          '--setting-sources',
          'project,local',
          '--settings',
          settings,
          '--permission-mode',
          'default',
        ],
        { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'ignore' },
      );
      try {
        const asked = () =>
          received.find((r) => readHook(r.payload)?.kind === 'needs')?.payload as
            { notification_type?: string; message?: string } | undefined;
        const shown = () => (existsSync(screen) ? readFileSync(screen, 'utf8') : '');
        for (let i = 0; i < 900 && !asked(); i++) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          // This test does not go through Claude's first-run setup for the user.
          expect(
            shown(),
            "Claude Code's first-run setup is open: run claude once in a terminal and finish it",
          ).not.toContain("Let's get started");
        }
        const payload = asked();
        expect(payload?.notification_type, `the terminal showed:\n${shown().slice(-1500)}`).toBe(
          'permission_prompt',
        );
        const hook = readHook(payload);
        expect(hook).toMatchObject({ kind: 'needs', need: 'approval' });
        const event = new Turns().event('claude', hook as HookEvent) as FinishedEvent;
        expect(formatEvent(english, event, 'result', undefined)).toMatchObject({
          title: 'Claude Code',
          message: 'Needs your approval',
          priority: 4,
        });
        expect(existsSync(join(work, 'approval.txt'))).toBe(false);
      } finally {
        spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f']);
      }
    },
  );

  it.skipIf(!claude)('Claude Code: a turn notifies that it finished, with its reply', async () => {
    const settings = join(folder, 'claude-settings.json');
    writeFileSync(settings, JSON.stringify(claudeHookSettings(PORT)));
    const { result, payloads, events } = await turn('claude', 'claude', readHook, () =>
      run(
        claude as string,
        ['-p', PROMPT, '--setting-sources', 'project,local', '--settings', settings],
        { cwd: folder, timeout: 180_000 },
      ),
    );
    expect(result.status, String(result.stderr)).toBe(0);
    const names = payloads.map((p) => (p as { hook_event_name?: string }).hook_event_name);
    expect(names).toContain('UserPromptSubmit');
    expect(names).toContain('Stop');
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event).toMatchObject({ kind: 'claude', state: 'finished', folder: basename(folder) });
    expect(event.durationMs).toBeGreaterThan(0);
    expect((event as { reply?: string }).reply?.toLowerCase()).toContain('pong');
    const message = formatEvent(english, event, 'details', undefined);
    expect(message.title).toBe(`Claude Code · ${basename(folder)}`);
    expect(message.message).toMatch(/^Finished · \d+s\npong/i);
  });

  it.skipIf(!codex)('Codex: a turn notifies that it finished, with its reply', async () => {
    // The hooks exactly as Connect writes them to hooks.json, here passed for this run only.
    const { hooks } = hookSettings(codexHooks(windowsCurl), PORT) as {
      hooks: Record<string, unknown>;
    };
    const overrides = Object.entries(hooks).flatMap(([event, groups]) => [
      '-c',
      `hooks.${event}=${toml(groups)}`,
    ]);
    const { result, payloads, events } = await turn('codex', 'codex', readCodexHook, () =>
      run(
        codex as string,
        [
          'exec',
          '--skip-git-repo-check',
          '--ephemeral',
          '--sandbox',
          'read-only',
          '--dangerously-bypass-hook-trust',
          ...overrides,
          PROMPT,
        ],
        { cwd: folder, timeout: 240_000 },
      ),
    );
    expect(result.status, String(result.stderr).slice(-2000)).toBe(0);
    const names = payloads.map((p) => (p as { hook_event_name?: string }).hook_event_name);
    expect(names).toContain('UserPromptSubmit');
    expect(names).toContain('Stop');
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event).toMatchObject({ kind: 'codex', state: 'finished', folder: basename(folder) });
    expect(event.durationMs).toBeGreaterThan(0);
    expect((event as { reply?: string }).reply?.toLowerCase()).toContain('pong');
    const message = formatEvent(english, event, 'details', undefined);
    expect(message.title).toBe(`Codex · ${basename(folder)}`);
    expect(message.message).toMatch(/^Finished · \d+s\npong/i);
  });
});
