// Runs inside a real VS Code instance (see scripts/smoke.mjs).
import * as assert from 'node:assert/strict';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import * as vscode from 'vscode';
import { spawn } from 'node:child_process';
import { CLAUDE_HOOKS } from '../../src/extension/claude/settings';
import { codexHooks } from '../../src/extension/codex/settings';
import { copilotHooks } from '../../src/extension/copilot/settings';
import { hookSettings } from '../../src/extension/hookFile';

const EXTENSION_ID = 'MBKDevStudio.nightping';
/** Milliseconds from an agent's hook to the request to ntfy (D-020). */
const SEND_BUDGET_MS = 500;

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
      'nightping.send',
      'nightping.setToken',
      'nightping.clearToken',
      'nightping.removeDestination',
      'nightping.pause',
      'nightping.resume',
      'nightping.connectClaudeCode',
      'nightping.disconnectClaudeCode',
      'nightping.copyClaudeCodeSettings',
      'nightping.connectCodex',
      'nightping.disconnectCodex',
      'nightping.copyCodexSettings',
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

  async 'starts without a destination'() {
    const settings = vscode.workspace.getConfiguration('nightping');
    assert.deepEqual(settings.get('destinations'), []);
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
    const reset = await useSettings({
      destinations: [{ server: `${ntfy.server}/`, topic: 'smoke-test' }],
    });
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
      await reset();
      await ntfy.close();
    }
  },

  async 'sends to every destination that is on, and a test to one of them'() {
    const ntfy = await fakeNtfy();
    const reset = await useSettings({
      destinations: [
        { server: ntfy.server, topic: 'first' },
        { name: 'Off', server: ntfy.server, topic: 'off', enabled: false },
        { server: ntfy.server, topic: 'second' },
      ],
    });
    try {
      await vscode.commands.executeCommand('nightping.sendTest');
      const topics = ntfy.requests.map((request) => (JSON.parse(request.body) as Body).topic);
      assert.deepEqual(topics.sort(), ['first', 'second']);
      // A test to one destination reaches it even while it is off.
      await vscode.commands.executeCommand('nightping.sendTest', `${ntfy.server}/off`);
      assert.equal(ntfy.requests.length, 3);
      assert.equal((JSON.parse(ntfy.requests[2].body) as Body).topic, 'off');
    } finally {
      await reset();
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

  async 'notifies when a notebook cell finishes, with the file and cell at the details level'() {
    // No Jupyter here: a kernel of the test's own runs the cells through the same API.
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder, 'scripts/smoke.mjs opens a folder');
    const file = join(folder.uri.fsPath, 'smoke.ipynb');
    writeFileSync(file, notebook(['print("done")', 'fail()']));
    const controller = vscode.notebooks.createNotebookController(
      'nightping-smoke-kernel',
      'jupyter-notebook',
      'Nightping smoke kernel',
    );
    controller.supportedLanguages = ['python'];
    controller.executeHandler = (cells) => {
      for (const cell of cells) {
        const execution = controller.createNotebookCellExecution(cell);
        const end = Date.now();
        // 42 seconds: past the 30-second minimum, so the cell that succeeds notifies too.
        execution.start(end - 42_000);
        execution.end(!cell.document.getText().includes('fail'), end);
      }
    };
    const ntfy = await fakeNtfy();
    const reset = await useSettings({
      server: ntfy.server,
      topic: 'smoke-test',
      onlyWhenAway: false,
      content: 'details',
    });
    try {
      const document = await vscode.workspace.openNotebookDocument(vscode.Uri.file(file));
      await vscode.window.showNotebookDocument(document);
      controller.updateNotebookAffinity(document, vscode.NotebookControllerAffinity.Preferred);
      await vscode.commands.executeCommand('notebook.selectKernel', {
        id: 'nightping-smoke-kernel',
        extension: EXTENSION_ID,
      });
      await vscode.commands.executeCommand('notebook.execute', document.uri);
      await waitFor(() => ntfy.requests[1]);
      // Later changes to the cells (outputs, metadata) must not notify again.
      await new Promise((resolve) => setTimeout(resolve, 1000));
      assert.equal(ntfy.requests.length, 2);
      // Both go out at once, so they may arrive in either order.
      const bodies = ntfy.requests
        .map((r) => JSON.parse(r.body) as Record<string, unknown>)
        .sort((a, b) => String(a.title).localeCompare(String(b.title)));
      const where = vscode.workspace.name;
      assert.deepEqual(bodies[0], {
        topic: 'smoke-test',
        title: `smoke.ipynb · cell 1 · ${where}`,
        message: 'Succeeded · 42s',
        tags: ['white_check_mark'],
      });
      assert.deepEqual(bodies[1], {
        topic: 'smoke-test',
        title: `smoke.ipynb · cell 2 · ${where}`,
        message: 'Failed · 42s',
        tags: ['x'],
        priority: 4,
      });
    } finally {
      await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
      controller.dispose();
      await reset();
      await ntfy.close();
      rmSync(file, { force: true });
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

  async 'sends what a key binding or another extension passes, and says how it went'() {
    const send = (input: unknown) => vscode.commands.executeCommand('nightping.send', input);
    assert.deepEqual(await send('Hi'), { sent: false, reason: 'not-set-up' });

    const ntfy = await fakeNtfy();
    const reset = await useSettings({ server: ntfy.server, topic: 'smoke-test' });
    try {
      const passed = { title: 'Deploy', message: 'Staging is up', priority: 4, tags: ['rocket'] };
      assert.deepEqual(await send(passed), { sent: true });
      assert.deepEqual(JSON.parse(ntfy.requests[0].body), { topic: 'smoke-test', ...passed });
      // The text alone gets a title, so the phone does not show the topic instead.
      assert.deepEqual(await send('Back in five minutes'), { sent: true });
      assert.deepEqual(JSON.parse(ntfy.requests[1].body), {
        topic: 'smoke-test',
        title: 'VS Code',
        message: 'Back in five minutes',
      });

      await assert.rejects(Promise.resolve(send({ message: ' ' })), /"message" must be text/);
      await assert.rejects(Promise.resolve(send({ message: 'Hi', priority: 9 })), /"priority"/);

      await vscode.commands.executeCommand('nightping.pause', 60);
      assert.deepEqual(await send('Hi'), { sent: false, reason: 'paused' });
      assert.equal(ntfy.requests.length, 2);
    } finally {
      await vscode.commands.executeCommand('nightping.resume');
      await reset();
      await ntfy.close();
    }

    // The server went away: the caller hears why, as the panel's history says it.
    const gone = await useSettings({ server: ntfy.server, topic: 'smoke-test' });
    try {
      const result = (await send('Hi')) as { sent: boolean; reason: string; error: string };
      assert.equal(result.sent, false);
      assert.equal(result.reason, 'failed');
      assert.match(result.error, /^Could not reach http:\/\/127\.0\.0\.1:\d+ \(ECONNREFUSED\)\.$/);
    } finally {
      await gone();
    }
  },

  async 'sends through the proxy set in VS Code'() {
    // The server's name does not resolve, so the message gets there only through the proxy:
    // VS Code's fetch asks it for a tunnel, here answered by the stand-in itself.
    const proxy = await fakeNtfy();
    const http = vscode.workspace.getConfiguration('http');
    await http.update('proxy', proxy.server, vscode.ConfigurationTarget.Global);
    const reset = await useSettings({ server: 'http://ntfy.test', topic: 'smoke-test' });
    try {
      const sent = await vscode.commands.executeCommand('nightping.send', 'Through the proxy');
      assert.deepEqual(sent, { sent: true }, JSON.stringify(sent));
      assert.deepEqual(proxy.tunnels, ['ntfy.test:80']);
      assert.equal(proxy.requests[0].headers.host, 'ntfy.test');
    } finally {
      await http.update('proxy', undefined, vscode.ConfigurationTarget.Global);
      await reset();
      await proxy.close();
    }
  },

  async 'takes Claude Code hooks added by hand, and notifies about its turns'() {
    // scripts/smoke.mjs points CLAUDE_CONFIG_DIR at an empty folder and sets the port.
    const dir = process.env.CLAUDE_CONFIG_DIR;
    assert.ok(dir, 'scripts/smoke.mjs sets CLAUDE_CONFIG_DIR');
    const port = 47388;
    const ntfy = await fakeNtfy();
    const reset = await useSettings({
      server: ntfy.server,
      topic: 'smoke-test',
      onlyWhenAway: false,
      // The test's turn lasts milliseconds; by default a turn under 30 seconds stays quiet.
      minimumDuration: 0,
      content: 'details',
    });
    const file = join(dir, 'settings.json');
    try {
      // What Copy Settings gives, pasted in: Nightping sees the file and starts listening.
      writeFileSync(file, JSON.stringify(hookSettings(CLAUDE_HOOKS, port), null, 2));
      await until(async () => (await status(port)) === 200);

      const session = { session_id: 'smoke', cwd: join(dir, 'my-app') };
      await hook(port, { ...session, hook_event_name: 'UserPromptSubmit', prompt: 'x' });
      const stopped = Date.now();
      await hook(port, {
        ...session,
        hook_event_name: 'Stop',
        last_assistant_message: 'Done. Everything passes.',
        background_tasks: [],
      });
      const sent = await waitFor(() => ntfy.requests[0]);
      // Nightping's own part, from the hook to the request to ntfy (D-020).
      assert.ok(sent.at - stopped <= SEND_BUDGET_MS, `sent after ${sent.at - stopped} ms`);
      const finished = JSON.parse(sent.body) as Message;
      assert.equal(finished.title, 'Claude Code · my-app');
      assert.match(finished.message, /^Finished · \d+s\nDone\.$/);

      await hook(port, {
        ...session,
        hook_event_name: 'Notification',
        notification_type: 'permission_prompt',
        message: 'Claude needs your permission to use Bash',
      });
      const approval = JSON.parse((await waitFor(() => ntfy.requests[1])).body) as Message;
      assert.equal(
        approval.message,
        'Needs your approval\nClaude needs your permission to use Bash',
      );
      assert.equal(approval.priority, 4);
    } finally {
      // Without the hooks, the endpoint closes.
      rmSync(file, { force: true });
      await until(async () => (await status(port)) === undefined);
      await reset();
      await ntfy.close();
    }
  },

  async 'runs Codex hooks added by hand through the shell, and notifies about its turns'() {
    // scripts/smoke.mjs points CODEX_HOME at an empty folder.
    const dir = process.env.CODEX_HOME;
    assert.ok(dir, 'scripts/smoke.mjs sets CODEX_HOME');
    const port = 47388;
    const ntfy = await fakeNtfy();
    const reset = await useSettings({
      server: ntfy.server,
      topic: 'smoke-test',
      onlyWhenAway: false,
      minimumDuration: 0,
      content: 'details',
    });
    const file = join(dir, 'hooks.json');
    const windowsCurl = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'curl.exe');
    try {
      // What Copy Settings gives, pasted in: Nightping sees the file and starts listening.
      const settings = hookSettings(codexHooks(windowsCurl), port);
      writeFileSync(file, JSON.stringify(settings, null, 2));
      await until(async () => (await status(port)) === 200);

      // Each event runs its hook's command in the shell Codex uses, with the JSON on stdin.
      const hooks = settings.hooks as Record<string, Array<{ hooks: Record<string, string>[] }>>;
      const [group] = hooks.Stop;
      const [{ command, commandWindows }] = group.hooks;
      const session = { session_id: 'smoke', turn_id: 't1', cwd: join(dir, 'shop') };
      const run = (payload: Record<string, unknown>) =>
        runHook(process.platform === 'win32' ? commandWindows : command, payload);
      await run({ ...session, hook_event_name: 'UserPromptSubmit', prompt: 'Rename foo' });
      await run({
        ...session,
        hook_event_name: 'Stop',
        stop_hook_active: false,
        last_assistant_message: 'Renamed foo to bar. Tests pass.',
      });
      const finished = JSON.parse((await waitFor(() => ntfy.requests[0])).body) as Message;
      assert.equal(finished.title, 'Codex · shop');
      assert.match(finished.message, /^Finished · \d+s\nRenamed foo to bar\.$/);

      await run({
        ...session,
        hook_event_name: 'PermissionRequest',
        tool_name: 'Bash',
        tool_input: { command: 'npm test', description: 'Run the tests' },
      });
      const approval = JSON.parse((await waitFor(() => ntfy.requests[1])).body) as Message;
      assert.equal(approval.message, 'Needs your approval\nRun the tests');
      assert.equal(approval.priority, 4);
    } finally {
      // Without the hooks, the endpoint closes.
      rmSync(file, { force: true });
      await until(async () => (await status(port)) === undefined);
      await reset();
      await ntfy.close();
    }
  },

  async 'runs GitHub Copilot hooks from its hooks folder, and notifies about its turns'() {
    // scripts/smoke.mjs points the home folder at an empty one, never the developer's.
    const home = homedir();
    assert.ok(
      home.startsWith(tmpdir()) && basename(home).startsWith('nightping-smoke-home-'),
      `scripts/smoke.mjs moves the home folder (it is ${home})`,
    );
    const port = 47388;
    const ntfy = await fakeNtfy();
    const reset = await useSettings({
      server: ntfy.server,
      topic: 'smoke-test',
      onlyWhenAway: false,
      minimumDuration: 0,
      content: 'details',
    });
    const file = join(home, '.copilot', 'hooks', 'nightping.json');
    const windowsCurl = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'curl.exe');
    try {
      // What Copy Settings gives, saved as the file: Nightping sees it and starts listening.
      const settings = hookSettings(copilotHooks(windowsCurl), port);
      writeFileSync(file, JSON.stringify(settings, null, 2));
      await until(async () => (await status(port)) === 200);

      // Each event runs its hook's command in the shell, with the JSON on stdin.
      const hooks = settings.hooks as Record<string, Record<string, string>[]>;
      const [{ bash, powershell }] = hooks.Stop;
      const run = (payload: Record<string, unknown>) =>
        runHook(process.platform === 'win32' ? powershell : bash, payload);
      // As VS Code's agent mode sends them.
      const session = {
        timestamp: new Date().toISOString(),
        session_id: 'smoke',
        transcript_path: join(home, 'transcript.jsonl'),
        cwd: join(home, 'shop'),
      };
      await run({ ...session, hook_event_name: 'UserPromptSubmit', prompt: 'Rename foo' });
      await run({ ...session, hook_event_name: 'Stop', stop_hook_active: false });
      const finished = JSON.parse((await waitFor(() => ntfy.requests[0])).body) as Message;
      assert.equal(finished.title, 'Copilot · shop');
      assert.match(finished.message, /^Finished · \d+s$/);

      // As Copilot CLI sends a permission prompt.
      await run({
        sessionId: 'smoke-cli',
        timestamp: Date.now(),
        cwd: join(home, 'shop'),
        hook_event_name: 'Notification',
        notification_type: 'permission_prompt',
        title: 'Permission needed',
        message: 'Copilot wants to run npm test',
      });
      const approval = JSON.parse((await waitFor(() => ntfy.requests[1])).body) as Message;
      assert.equal(approval.message, 'Needs your approval\nCopilot wants to run npm test');
      assert.equal(approval.priority, 4);
    } finally {
      // Without the hooks, the endpoint closes.
      rmSync(file, { force: true });
      await until(async () => (await status(port)) === undefined);
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

interface Message {
  title: string;
  message: string;
  priority?: number;
}

/** Runs a Codex command hook as Codex does: in the session's shell, the payload on stdin. */
function runHook(command: string, payload: Record<string, unknown>): Promise<void> {
  const [file, args] =
    process.platform === 'win32'
      ? ['powershell.exe', ['-NoProfile', '-Command', command]]
      : ['/bin/sh', ['-c', command]];
  return new Promise((resolve, reject) => {
    const child = spawn(file, args);
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`hook exited with ${code}`)),
    );
    child.stdin.end(JSON.stringify(payload), 'utf8');
  });
}

/** Posts a hook payload the way Claude Code does. */
async function hook(port: number, payload: Record<string, unknown>): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${port}/nightping/claude-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 204);
}

/** The endpoint's status answer, or `undefined` when nothing listens. */
async function status(port: number): Promise<number | undefined> {
  try {
    return (await fetch(`http://127.0.0.1:${port}/nightping/status`)).status;
  } catch {
    return undefined;
  }
}

async function until(probe: () => Promise<boolean>, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (!(await probe())) {
    if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting for condition.');
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/** Sets `nightping.*` user settings; the returned function puts the defaults back. */
/** The ntfy message body, as far as the tests read it. */
interface Body {
  topic: string;
}

/** Sets settings until the returned function resets them; `server` and `topic` make one destination. */
async function useSettings(values: Record<string, unknown>): Promise<() => Promise<void>> {
  const { server, topic, ...rest } = values;
  const entries = Object.entries(rest);
  if (server !== undefined || topic !== undefined) {
    entries.unshift(['destinations', [{ server, topic }]]);
  }
  const settings = vscode.workspace.getConfiguration('nightping');
  const global = vscode.ConfigurationTarget.Global;
  for (const [key, value] of entries) await settings.update(key, value, global);
  return async () => {
    for (const [key] of entries) await settings.update(key, undefined, global);
  };
}

/** A Jupyter notebook with one Python code cell per source. */
function notebook(sources: string[]): string {
  return JSON.stringify({
    cells: sources.map((source) => ({
      cell_type: 'code',
      source: [source],
      metadata: {},
      outputs: [],
      execution_count: null,
    })),
    metadata: { language_info: { name: 'python' } },
    nbformat: 4,
    nbformat_minor: 5,
  });
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

/**
 * A local stand-in for ntfy that records each request and answers like ntfy does. Set as the
 * proxy, it also opens each tunnel asked for (CONNECT) and answers what comes through it.
 */
async function fakeNtfy() {
  const tunnels: string[] = [];
  const requests: {
    url?: string;
    headers: http.IncomingHttpHeaders;
    body: string;
    at: number;
  }[] = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => (body += chunk));
    request.on('end', () => {
      requests.push({ url: request.url, headers: request.headers, body, at: Date.now() });
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{"id":"smoke","event":"message"}');
    });
  });
  server.on('connect', (request: http.IncomingMessage, socket: Duplex, head: Buffer) => {
    tunnels.push(request.url ?? '');
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length > 0) socket.unshift(head);
    server.emit('connection', socket);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    server: `http://127.0.0.1:${port}`,
    requests,
    tunnels,
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
