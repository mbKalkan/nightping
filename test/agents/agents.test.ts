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
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
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
  endpoint.start(PORT);
  for (let i = 0; i < 50 && endpoint.state.kind !== 'listening'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  expect(endpoint.state.kind).toBe('listening');
  folder = mkdtempSync(join(tmpdir(), 'nightping-agent-'));
});

afterAll(() => {
  endpoint.stop();
  rmSync(folder, { recursive: true, force: true });
});

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Runs a command without blocking: the endpoint answers in this same process, and an agent waits
 * for its hooks.
 */
function run(command: string, args: string[], timeout: number): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: folder, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => (stdout += data));
    child.stderr.on('data', (data) => (stderr += data));
    const timer = setTimeout(() => child.kill(), timeout);
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}

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

const where = (command: string) => {
  const found = spawnSync(process.platform === 'win32' ? 'where' : 'which', [command], {
    encoding: 'utf8',
  });
  return found.status === 0 ? found.stdout.split(/\r?\n/)[0].trim() : undefined;
};

/** Codex on PATH, or the one the VS Code extension brings. */
function findCodex(): string | undefined {
  if (process.env.CODEX_PATH) return process.env.CODEX_PATH;
  const onPath = where('codex');
  if (onPath) return onPath;
  const extensions = join(homedir(), '.vscode', 'extensions');
  if (!existsSync(extensions)) return undefined;
  for (const name of readdirSync(extensions).filter((n) => n.startsWith('openai.chatgpt-'))) {
    const bin = join(extensions, name, 'bin');
    if (!existsSync(bin)) continue;
    for (const platform of readdirSync(bin)) {
      const exe = join(bin, platform, process.platform === 'win32' ? 'codex.exe' : 'codex');
      if (existsSync(exe)) return exe;
    }
  }
  return undefined;
}

/** A JSON value as an inline TOML value, for Codex's -c. */
function toml(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map(toml).join(', ')}]`;
  const entries = Object.entries(value as Record<string, unknown>);
  return `{ ${entries.map(([key, v]) => `${key} = ${toml(v)}`).join(', ')} }`;
}

/** The VS Code that the smoke tests download, and the node-pty it ships (Windows only). */
function findVsCode(): { code: string; pty: string } | undefined {
  const root = join(process.cwd(), '.vscode-test');
  if (process.platform !== 'win32' || !existsSync(root)) return undefined;
  for (const name of readdirSync(root).filter((n) => n.startsWith('vscode-win32-'))) {
    const code = join(root, name, 'Code.exe');
    if (!existsSync(code)) continue;
    for (const commit of readdirSync(join(root, name))) {
      const modules = join(root, name, commit, 'resources', 'app', 'node_modules.asar');
      if (existsSync(modules)) return { code, pty: join(modules, 'node-pty') };
    }
  }
  return undefined;
}

const claude = where('claude');
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
        180_000,
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
    const windowsCurl = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'curl.exe');
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
        240_000,
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
