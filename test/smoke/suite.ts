// Runs inside a real VS Code instance (see scripts/smoke.mjs).
import * as assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
      'nightping.open',
      'nightping.setUp',
      'nightping.sendTest',
      'nightping.setToken',
      'nightping.clearToken',
      'nightping.pause',
      'nightping.resume',
      'nightping.openSettings',
    ]) {
      assert.ok(commands.includes(command), command);
    }
  },

  async 'opens its settings from the command palette'() {
    await vscode.commands.executeCommand('nightping.openSettings');
  },

  async 'opens one panel, however often it is asked'() {
    const panels = () =>
      vscode.window.tabGroups.all
        .flatMap((group) => group.tabs)
        .filter(
          (tab) =>
            tab.input instanceof vscode.TabInputWebview &&
            tab.input.viewType.endsWith('nightping.panel'),
        );
    await vscode.commands.executeCommand('nightping.open');
    await vscode.commands.executeCommand('nightping.open');
    const open = await waitFor(() => (panels().length > 0 ? panels() : undefined));
    assert.equal(open.length, 1);
    assert.equal(open[0].label, 'Nightping');
    await vscode.window.tabGroups.close(open);
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

  async 'notifies when a task fails, with its name at the details level'() {
    const ntfy = await fakeNtfy();
    const reset = await useSettings({
      server: ntfy.server,
      topic: 'smoke-test',
      // The test window is in use, and the task fails at once.
      onlyWhenAway: false,
      content: 'details',
    });
    try {
      const exitCode = await runTask('nightping-smoke-fail', 'exit 3');
      assert.ok(exitCode !== undefined && exitCode !== 0, `exit code ${exitCode}`);
      const request = await waitFor(() => ntfy.requests[0]);
      // The task's own shell reports the command too; only the task may notify.
      await new Promise((resolve) => setTimeout(resolve, 1000));
      assert.equal(ntfy.requests.length, 1);
      const body = JSON.parse(request.body) as Record<string, unknown>;
      assert.equal(body.title, `nightping-smoke-fail · ${vscode.workspace.name}`);
      // Windows PowerShell reports any failure as 1.
      assert.match(String(body.message), /^Failed \(exit \d+\) · \d+s$/);
      assert.deepEqual(body.tags, ['x']);
      assert.equal(body.priority, 4);
    } finally {
      await reset();
      await ntfy.close();
    }
  },

  async 'notifies when a terminal command fails, with its command line'() {
    // Bash reports commands through shell integration (Windows PowerShell 5.1 often cannot).
    const shellPath =
      process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : '/bin/bash';
    if (!existsSync(shellPath)) {
      console.log(`    skipped: no ${shellPath}`);
      return;
    }
    const ntfy = await fakeNtfy();
    const reset = await useSettings({
      server: ntfy.server,
      topic: 'smoke-test',
      onlyWhenAway: false,
      content: 'details',
    });
    const terminal = vscode.window.createTerminal({ name: 'nightping-smoke', shellPath });
    try {
      const integration = await waitFor(() => terminal.shellIntegration);
      integration.executeCommand('sh -c "exit 3"');
      const request = await waitFor(() => ntfy.requests[0]);
      const body = JSON.parse(request.body) as Record<string, unknown>;
      assert.equal(body.title, `sh -c "exit 3" · ${vscode.workspace.name}`);
      assert.match(String(body.message), /^Failed \(exit 3\) · \d+s$/);
    } finally {
      terminal.dispose();
      await reset();
      await ntfy.close();
    }
  },

  async 'notifies once when a debug session ends'() {
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder, 'scripts/smoke.mjs opens a folder');
    const program = join(folder.uri.fsPath, 'nightping-smoke.js');
    writeFileSync(program, 'setTimeout(() => {}, 300);\n');
    const ntfy = await fakeNtfy();
    const reset = await useSettings({
      server: ntfy.server,
      topic: 'smoke-test',
      onlyWhenAway: false,
      minimumDuration: 0,
      content: 'details',
    });
    const name = 'nightping-smoke-debug';
    try {
      const ended = new Promise<void>((resolve) => {
        const listener = vscode.debug.onDidTerminateDebugSession((session) => {
          if (session.name !== name) return;
          listener.dispose();
          resolve();
        });
      });
      const started = await vscode.debug.startDebugging(folder, {
        type: 'node',
        request: 'launch',
        name,
        program,
      });
      assert.ok(started, 'the built-in JavaScript debugger starts');
      await ended;
      const request = await waitFor(() => ntfy.requests[0]);
      // The Node debugger runs the program in a child session; that one must not notify again.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      assert.equal(ntfy.requests.length, 1);
      const body = JSON.parse(request.body) as Record<string, unknown>;
      assert.equal(body.title, `${name} · ${vscode.workspace.name}`);
      assert.match(String(body.message), /^Ended · \d+s$/);
      assert.deepEqual(body.tags, ['checkered_flag']);
    } finally {
      await reset();
      await ntfy.close();
    }
  },

  async 'sends nothing while paused but a test, and notifies again once resumed'() {
    const ntfy = await fakeNtfy();
    const reset = await useSettings({
      server: ntfy.server,
      topic: 'smoke-test',
      onlyWhenAway: false,
    });
    try {
      await vscode.commands.executeCommand('nightping.pause', 60);
      await runTask('nightping-smoke-paused', 'exit 3');
      await new Promise((resolve) => setTimeout(resolve, 500));
      assert.equal(ntfy.requests.length, 0);
      await vscode.commands.executeCommand('nightping.sendTest');
      assert.equal(ntfy.requests.length, 1);

      await vscode.commands.executeCommand('nightping.resume');
      await runTask('nightping-smoke-resumed', 'exit 3');
      const request = await waitFor(() => ntfy.requests[1]);
      assert.equal((JSON.parse(request.body) as { title: string }).title, 'Task');
    } finally {
      await vscode.commands.executeCommand('nightping.resume');
      await reset();
      await ntfy.close();
    }
  },

  async 'keeps a short successful task quiet'() {
    const ntfy = await fakeNtfy();
    const reset = await useSettings({
      server: ntfy.server,
      topic: 'smoke-test',
      onlyWhenAway: false,
    });
    try {
      assert.equal(await runTask('nightping-smoke-pass', 'exit 0'), 0);
      await new Promise((resolve) => setTimeout(resolve, 500));
      assert.equal(ntfy.requests.length, 0);
    } finally {
      await reset();
      await ntfy.close();
    }
  },
};

/** Sets `nightping.*` user settings; the returned function puts the defaults back. */
async function useSettings(values: Record<string, unknown>): Promise<() => Promise<void>> {
  const settings = vscode.workspace.getConfiguration('nightping');
  const global = vscode.ConfigurationTarget.Global;
  for (const [key, value] of Object.entries(values)) await settings.update(key, value, global);
  return async () => {
    for (const key of Object.keys(values)) await settings.update(key, undefined, global);
  };
}

/** Runs a shell task in the open folder and returns its exit code. */
async function runTask(name: string, command: string): Promise<number | undefined> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, 'scripts/smoke.mjs opens a folder');
  const task = new vscode.Task(
    { type: 'nightping-smoke' },
    folder,
    name,
    'nightping',
    new vscode.ShellExecution(command),
  );
  const ended = new Promise<number | undefined>((resolve) => {
    const listener = vscode.tasks.onDidEndTaskProcess((event) => {
      if (event.execution.task.name !== name) return;
      listener.dispose();
      resolve(event.exitCode);
    });
  });
  await vscode.tasks.executeTask(task);
  return ended;
}

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
