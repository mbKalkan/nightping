// How long an agent waits for one of Nightping's hooks, with VS Code open and with it closed: the
// performance budget of D-020, measured with the real hooks. Claude Code's http hooks are timed
// from Claude's own debug log (one short turn each way). Copilot's command hook runs in the shell
// Copilot uses for it, as in the smoke test; the time includes starting that shell. Codex runs
// its hooks asynchronously and never waits for them. Prints what it measured.
//   npm run test:agents -- latency
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hookSettings as claudeHookSettings } from '../../src/extension/claude/settings';
import { copilotCommands } from '../../src/extension/copilot/settings';
import { Endpoint } from '../../src/extension/endpoint';
import { claude, listen, run, windowsCurl } from './support';

/** Milliseconds an agent may wait for one hook (D-020). */
const BUDGET = { claude: 50, copilot: 1500 };
const OPEN = 47384;
/** Nothing listens here, as when VS Code is closed. */
const CLOSED = 47383;
const endpoint = new Endpoint(() => undefined);
let folder: string;

beforeAll(async () => {
  await listen(endpoint, OPEN);
  folder = mkdtempSync(join(tmpdir(), 'nightping-latency-'));
});

afterAll(() => {
  endpoint.stop();
  rmSync(folder, { recursive: true, force: true });
});

/** How long Claude Code waited for each http hook in one short turn, from its debug log. */
async function claudeWaits(port: number): Promise<number[]> {
  const settings = join(folder, `claude-${port}.json`);
  const log = join(folder, `claude-${port}.log`);
  writeFileSync(settings, JSON.stringify(claudeHookSettings(port)));
  const args = ['-p', 'Reply with exactly the word pong.', '--setting-sources', 'project,local'];
  const result = await run(
    claude as string,
    [...args, '--settings', settings, '--debug-file', log],
    { cwd: folder, timeout: 180_000 },
  );
  expect(result.status, result.stderr).toBe(0);
  const waits: number[] = [];
  let posted: number | undefined;
  for (const line of readFileSync(log, 'utf8').split(/\r?\n/)) {
    const at = Date.parse(line.slice(0, 24));
    if (line.includes(`HTTP hook POST to http://127.0.0.1:${port}/`)) posted = at;
    else if (posted !== undefined && /HTTP hook (response status|error)/.test(line)) {
      waits.push(at - posted);
      posted = undefined;
    }
  }
  return waits;
}

/** How long Copilot waits for the command hook, five times. */
async function copilotWaits(port: number): Promise<number[]> {
  const { bash, powershell } = copilotCommands(port, windowsCurl);
  const [file, args] =
    process.platform === 'win32'
      ? ['powershell.exe', ['-NoProfile', '-Command', powershell]]
      : ['/bin/sh', ['-c', bash]];
  const waits: number[] = [];
  for (let i = 0; i < 5; i++) {
    const started = performance.now();
    const result = await run(file, args, {
      timeout: 10_000,
      input: JSON.stringify({ hook_event_name: 'Stop' }),
    });
    waits.push(Math.round(performance.now() - started));
    expect(result.status).toBe(0);
  }
  return waits;
}

describe('how long an agent waits for a hook (D-020)', () => {
  it.skipIf(!claude)('Claude Code, with VS Code open and closed', async () => {
    for (const [port, vscode] of [
      [OPEN, 'open'],
      [CLOSED, 'closed'],
    ] as const) {
      const waits = await claudeWaits(port);
      console.log(`Claude Code, VS Code ${vscode}: ${waits.join(', ')} ms`);
      expect(waits.length).toBeGreaterThanOrEqual(2);
      expect(Math.max(...waits)).toBeLessThanOrEqual(BUDGET.claude);
    }
  });

  it('GitHub Copilot, with VS Code open and closed', async () => {
    for (const [port, vscode] of [
      [OPEN, 'open'],
      [CLOSED, 'closed'],
    ] as const) {
      const waits = await copilotWaits(port);
      console.log(`GitHub Copilot, VS Code ${vscode}: ${waits.join(', ')} ms`);
      expect(Math.max(...waits)).toBeLessThanOrEqual(BUDGET.copilot);
    }
  });
});
