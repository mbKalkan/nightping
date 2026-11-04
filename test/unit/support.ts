// Helpers for tests that run an agent's hook command against a real endpoint.
import { spawn } from 'node:child_process';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

export async function freePort(): Promise<number> {
  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

export async function until(check: () => boolean, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

export function runWithStdin(
  file: string,
  args: string[],
  input: string,
): Promise<{ code: number | null; stdout: string }> {
  return new Promise((resolve, reject) => {
    // As Rust's Command passes them: no extra quoting from Node on Windows.
    const child = spawn(file, args, { windowsVerbatimArguments: file === 'cmd.exe' });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => (stdout += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout }));
    child.stdin.end(input, 'utf8');
  });
}
