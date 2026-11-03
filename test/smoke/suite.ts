// Runs inside a real VS Code instance (see scripts/smoke.mjs).
import * as assert from 'node:assert/strict';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as vscode from 'vscode';

const EXTENSION_ID = 'MBKDevStudio.nightping';

async function waitFor<T>(probe: () => T | undefined, timeoutMs = 30_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = probe();
    if (value !== undefined) {
      return value;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for condition.');
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

const tests: Record<string, () => Promise<void>> = {
  async 'starts with VS Code, to listen for events in the background'() {
    await waitFor(() =>
      vscode.extensions.getExtension(EXTENSION_ID)?.isActive ? true : undefined,
    );
  },

  async 'contributes its commands'() {
    const commands = await vscode.commands.getCommands(true);
    for (const command of [
      'nightping.setUp',
      'nightping.sendTest',
      'nightping.setToken',
      'nightping.clearToken',
      'nightping.openSettings',
    ]) {
      assert.ok(commands.includes(command), command);
    }
  },

  async 'opens its settings from the command palette'() {
    await vscode.commands.executeCommand('nightping.openSettings');
  },

  async 'starts without a server or topic'() {
    const settings = vscode.workspace.getConfiguration('nightping');
    assert.equal(settings.get('server'), '');
    assert.equal(settings.get('topic'), '');
  },

  async 'sends nothing while it is not set up'() {
    const ntfy = await fakeNtfy();
    try {
      await vscode.commands.executeCommand('nightping.sendTest');
      assert.equal(ntfy.requests.length, 0);
    } finally {
      await ntfy.close();
    }
  },

  async 'sends a test notification to the server and topic in the settings'() {
    const ntfy = await fakeNtfy();
    const settings = vscode.workspace.getConfiguration('nightping');
    const global = vscode.ConfigurationTarget.Global;
    await settings.update('server', `${ntfy.server}/`, global);
    await settings.update('topic', 'smoke-test', global);
    try {
      await vscode.commands.executeCommand('nightping.sendTest');
      assert.equal(ntfy.requests.length, 1);
      const [request] = ntfy.requests;
      assert.equal(request.url, '/');
      assert.equal(request.headers.authorization, undefined);
      const body = JSON.parse(request.body) as { topic: string; title: string };
      assert.equal(body.topic, 'smoke-test');
      assert.equal(body.title, 'Nightping test');
    } finally {
      await settings.update('server', undefined, global);
      await settings.update('topic', undefined, global);
      await ntfy.close();
    }
  },
};

/** A local stand-in for ntfy that records each request and answers like ntfy does. */
async function fakeNtfy() {
  const requests: { url?: string; headers: http.IncomingHttpHeaders; body: string }[] = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => (body += chunk));
    request.on('end', () => {
      requests.push({ url: request.url, headers: request.headers, body });
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{"id":"smoke","event":"message"}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    server: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export async function run(): Promise<void> {
  const failures: string[] = [];
  for (const [name, test] of Object.entries(tests)) {
    try {
      await test();
      console.log(`  ✓ ${name}`);
    } catch (error) {
      console.log(`  ✗ ${name}`);
      failures.push(`${name}: ${error instanceof Error ? error.stack : String(error)}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`${failures.length} smoke test(s) failed:\n${failures.join('\n')}`);
  }
}
