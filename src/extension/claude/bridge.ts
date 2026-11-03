// Claude Code in VS Code: the hooks in its user settings, the endpoint they post to, and the
// turns they report. The endpoint runs only while Nightping's hooks are in the settings.
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ClaudeStatus } from '../../shared/protocol';
import type { FinishedEvent } from '../events';
import { Endpoint, type EndpointState } from './endpoint';
import { readHook } from './payload';
import {
  connectedText,
  disconnectedText,
  hookSettings,
  hooksState,
  InvalidSettings,
  type HooksState,
} from './settings';

export const DEFAULT_PORT = 47391;
/** Turns whose end never came (a closed console) are forgotten after this many. */
const TURN_LIMIT = 100;

/**
 * Claude Code's user settings. An absolute `CLAUDE_CONFIG_DIR` moves them, as it does for Claude
 * Code's VS Code extension.
 */
export function settingsFile(): string {
  const configured = process.env.CLAUDE_CONFIG_DIR;
  const dir =
    configured && path.isAbsolute(configured) ? configured : path.join(os.homedir(), '.claude');
  return path.join(dir, 'settings.json');
}

/** The file as people write it: `~` for the home folder. */
function shown(file: string): string {
  const home = os.homedir();
  return file.startsWith(home + path.sep) ? `~${file.slice(home.length)}` : file;
}

function currentPort(): number {
  const port = vscode.workspace.getConfiguration('nightping').get<unknown>('port');
  return typeof port === 'number' && Number.isInteger(port) && port >= 1024 && port <= 65535
    ? port
    : DEFAULT_PORT;
}

export class ClaudeBridge implements vscode.Disposable {
  private readonly endpoint: Endpoint;
  private readonly turns = new Map<string, number>();
  private readonly listeners = new Set<() => void>();
  private readonly disposables: vscode.Disposable[] = [];
  private hooks: HooksState = 'disconnected';
  /** Whether Claude Code's settings folder exists: Claude Code is on this computer. */
  private found = false;

  constructor(private readonly notify: (event: FinishedEvent) => void) {
    this.endpoint = new Endpoint(
      (payload) => this.receive(payload),
      () => this.changed(),
    );
    const file = settingsFile();
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(path.dirname(file)), path.basename(file)),
    );
    this.disposables.push(
      watcher,
      watcher.onDidCreate(() => void this.refresh()),
      watcher.onDidChange(() => void this.refresh()),
      watcher.onDidDelete(() => void this.refresh()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('nightping.port')) void this.refresh();
      }),
    );
  }

  status(): ClaudeStatus {
    const state: EndpointState = this.endpoint.state;
    return {
      hooks: this.hooks,
      found: this.found,
      file: shown(settingsFile()),
      receiving: state.kind,
      port: currentPort(),
    };
  }

  /** Reads the settings again and starts or stops the endpoint to match. */
  async refresh(): Promise<void> {
    const file = settingsFile();
    const [text, found] = await Promise.all([
      fs.readFile(file, 'utf8').catch(() => undefined),
      fs.stat(path.dirname(file)).then(
        (stat) => stat.isDirectory(),
        () => false,
      ),
    ]);
    const port = currentPort();
    this.hooks = hooksState(text, port);
    this.found = found;
    if (this.hooks === 'connected' || this.hooks === 'outdated') this.endpoint.start(port);
    else this.endpoint.stop();
    this.changed();
  }

  async connect(): Promise<void> {
    const file = settingsFile();
    const port = currentPort();
    const connect = vscode.l10n.t('Connect');
    const choice = await vscode.window.showWarningMessage(
      vscode.l10n.t('Connect Claude Code to Nightping?'),
      {
        modal: true,
        detail: vscode.l10n.t(
          'Nightping adds three hooks to {0}: when you send a prompt, when Claude finishes, and when it needs you. They send these events to Nightping on this computer only (port {1}). A copy of the file is saved first as {2}. If you already get Claude Code notifications another way, turn that off, or they will arrive twice.',
          shown(file),
          port,
          `${path.basename(file)}.nightping.bak`,
        ),
      },
      connect,
    );
    if (choice !== connect) return;
    if (await this.rewrite(file, (text) => connectedText(text, port))) {
      void vscode.window.showInformationMessage(
        vscode.l10n.t('Claude Code is connected. Its next turn notifies you when you are away.'),
      );
    }
  }

  async disconnect(): Promise<void> {
    await this.refresh();
    // Nothing to remove: leave the file exactly as it is.
    if (this.hooks === 'disconnected' || this.hooks === 'invalid') {
      void vscode.window.showInformationMessage(vscode.l10n.t('Claude Code is not connected.'));
      return;
    }
    const file = settingsFile();
    const disconnect = vscode.l10n.t('Disconnect');
    const choice = await vscode.window.showWarningMessage(
      vscode.l10n.t('Disconnect Claude Code from Nightping?'),
      {
        modal: true,
        detail: vscode.l10n.t(
          'Nightping removes only its own hooks from {0}, after saving a copy as {1}. Other hooks and settings stay as they are.',
          shown(file),
          `${path.basename(file)}.nightping.bak`,
        ),
      },
      disconnect,
    );
    if (choice !== disconnect) return;
    await this.rewrite(file, (text) => disconnectedText(text));
  }

  /** Puts the hooks on the clipboard, for people who add them by hand or ask Claude to. */
  async copySettings(): Promise<void> {
    await vscode.env.clipboard.writeText(
      `${JSON.stringify(hookSettings(currentPort()), null, 2)}\n`,
    );
    void vscode.window.showInformationMessage(
      vscode.l10n.t('Copied the hooks. Add them under "hooks" in {0}.', shown(settingsFile())),
    );
  }

  onDidChange(listener: () => void): vscode.Disposable {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  dispose(): void {
    this.endpoint.stop();
    this.listeners.clear();
    for (const disposable of this.disposables.splice(0)) disposable.dispose();
  }

  /** Backs the file up, writes the new text, and says why when it cannot. */
  private async rewrite(
    file: string,
    change: (text: string | undefined) => string,
  ): Promise<boolean> {
    let text: string | undefined;
    try {
      text = await fs.readFile(file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return this.failed(error);
    }
    let next: string;
    try {
      next = change(text);
    } catch (error) {
      if (!(error instanceof InvalidSettings)) throw error;
      const copy = vscode.l10n.t('Copy Settings');
      const choice = await vscode.window.showErrorMessage(
        vscode.l10n.t(
          '{0} is not valid JSON, so Nightping does not change it. Fix it, or add the hooks yourself.',
          shown(file),
        ),
        copy,
      );
      if (choice === copy) await this.copySettings();
      return false;
    }
    try {
      await fs.mkdir(path.dirname(file), { recursive: true });
      if (text !== undefined) await fs.writeFile(`${file}.nightping.bak`, text, 'utf8');
      await fs.writeFile(file, next, 'utf8');
    } catch (error) {
      return this.failed(error);
    }
    await this.refresh();
    return true;
  }

  private failed(error: unknown): false {
    void vscode.window.showErrorMessage(
      vscode.l10n.t(
        'Could not change {0}: {1}',
        shown(settingsFile()),
        error instanceof Error ? error.message : String(error),
      ),
    );
    return false;
  }

  private receive(payload: unknown): void {
    const hook = readHook(payload);
    if (!hook) return;
    if (hook.kind === 'prompt') {
      this.turns.delete(hook.session);
      this.turns.set(hook.session, Date.now());
      // A Map keeps insertion order: the first key is the oldest turn.
      if (this.turns.size > TURN_LIMIT) this.turns.delete(this.turns.keys().next().value as string);
      return;
    }
    const folder = hook.cwd ? path.basename(hook.cwd) : undefined;
    if (hook.kind === 'stop') {
      const start = this.turns.get(hook.session);
      this.turns.delete(hook.session);
      this.notify({
        kind: 'claude',
        state: 'finished',
        durationMs: start === undefined ? undefined : Date.now() - start,
        folder,
        reply: hook.reply,
        detail: undefined,
      });
      return;
    }
    this.notify({
      kind: 'claude',
      state: hook.need,
      durationMs: undefined,
      folder,
      reply: undefined,
      detail: hook.message,
    });
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }
}
