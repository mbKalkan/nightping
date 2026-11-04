// What the real agent tests share: finding the agents, running them without blocking, and
// starting the endpoint they post to.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { expect } from 'vitest';
import type { Endpoint } from '../../src/extension/endpoint';

export interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Runs a command without blocking: the endpoint answers in this same process, and an agent waits
 * for its hooks. `input` goes to its stdin.
 */
export function run(
  command: string,
  args: string[],
  options: { cwd?: string; timeout: number; input?: string },
): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: options.cwd, stdio: 'pipe' });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => (stdout += data));
    child.stderr.on('data', (data) => (stderr += data));
    const timer = setTimeout(() => child.kill(), options.timeout);
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
    child.stdin.end(options.input);
  });
}

/** Starts the endpoint on `port` and waits until it listens. */
export async function listen(endpoint: Endpoint, port: number): Promise<void> {
  endpoint.start(port);
  for (let i = 0; i < 50 && endpoint.state.kind !== 'listening'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  expect(endpoint.state.kind).toBe('listening');
}

export const where = (command: string) => {
  const found = spawnSync(process.platform === 'win32' ? 'where' : 'which', [command], {
    encoding: 'utf8',
  });
  return found.status === 0 ? found.stdout.split(/\r?\n/)[0].trim() : undefined;
};

/** Codex on PATH, or the one the VS Code extension brings. */
export function findCodex(): string | undefined {
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

/** The VS Code that the smoke tests download, and the node-pty it ships (Windows only). */
export function findVsCode(): { code: string; pty: string } | undefined {
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

/** A JSON value as an inline TOML value, for Codex's -c. */
export function toml(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map(toml).join(', ')}]`;
  const entries = Object.entries(value as Record<string, unknown>);
  return `{ ${entries.map(([key, v]) => `${key} = ${toml(v)}`).join(', ')} }`;
}

/** Windows' own curl.exe, which the Codex and Copilot hooks name on Windows. */
export const windowsCurl = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'curl.exe');

export const claude = where('claude');
