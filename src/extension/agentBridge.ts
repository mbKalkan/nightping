// An AI agent in VS Code: Nightping's hooks in the agent's settings file, the shared endpoint they
// post to, and the turns they report. The endpoint runs while some agent's hooks are connected.
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { AgentKind, AgentStatus } from '../shared/protocol';
import type { HookEvent } from './claude/payload';
import type { Endpoint, EndpointState } from './endpoint';
import type { FinishedEvent } from './events';
import {
  connectedText,
  disconnectedText,
  hookSettings,
  hooksState,
  InvalidSettings,
  type HookSpec,
  type HooksState,
} from './hookFile';
import { Turns } from './turns';

export const DEFAULT_PORT = 47391;

/** What sets one agent apart: where its hooks live, what they look like, what they send. */
export interface AgentConfig {
  agent: AgentKind;
  /** The file Nightping writes the hooks to. Its folder exists when the agent is installed. */
  file(): string;
  /**
   * The file holds only Nightping's hooks (Copilot reads every file in its hooks folder):
   * Connect writes it without a backup and Disconnect deletes it.
   */
  ownFile?: boolean;
  hooks: HookSpec;
  read(payload: unknown): HookEvent | undefined;
  texts: {
    connectTitle: string;
    /** `file`, `port` and the backup's name. */
    connectDetail(file: string, port: number, backup: string): string;
    connected: string;
    notConnected: string;
    disconnectTitle: string;
  };
}

/** The file as people write it: `~` for the home folder. */
export function shown(file: string): string {
  const home = os.homedir();
  return file.startsWith(home + path.sep) ? `~${file.slice(home.length)}` : file;
}

/** Windows' own curl.exe, for command hooks that run in PowerShell (where `curl` is an alias). */
export function windowsCurl(): string {
  return path.win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'curl.exe');
}

export function currentPort(): number {
  const port = vscode.workspace.getConfiguration('nightping').get<unknown>('port');
  return typeof port === 'number' && Number.isInteger(port) && port >= 1024 && port <= 65535
    ? port
    : DEFAULT_PORT;
}

export class AgentBridge implements vscode.Disposable {
  private readonly turns = new Turns();
  private readonly listeners = new Set<() => void>();
  private readonly disposables: vscode.Disposable[] = [];
  private hooks: HooksState = 'disconnected';
  /** Whether the agent's settings folder exists: the agent is on this computer. */
  private found = false;

  /** The endpoint is shared with other agents; it tells `changed` when its state changes. */
  constructor(
    private readonly config: AgentConfig,
    private readonly notify: (event: FinishedEvent) => void,
    private readonly endpoint: Endpoint,
  ) {
    const file = config.file();
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

  status(): AgentStatus {
    const state: EndpointState = this.endpoint.state;
    return {
      hooks: this.hooks,
      found: this.found,
      file: shown(this.config.file()),
      receiving: state.kind,
      port: currentPort(),
    };
  }

  /** Reads the file again and starts or stops the endpoint to match. */
  async refresh(): Promise<void> {
    const file = this.config.file();
    const [text, found] = await Promise.all([
      fs.readFile(file, 'utf8').catch(() => undefined),
      fs.stat(path.dirname(file)).then(
        (stat) => stat.isDirectory(),
        () => false,
      ),
    ]);
    const port = currentPort();
    this.hooks = hooksState(this.config.hooks, text, port);
    this.found = found;
    const wanted = this.hooks === 'connected' || this.hooks === 'outdated';
    this.endpoint.need(this.config.agent, wanted ? port : undefined);
    this.changed();
  }

  async connect(): Promise<void> {
    const file = this.config.file();
    const port = currentPort();
    const connect = vscode.l10n.t('Connect');
    const choice = await vscode.window.showWarningMessage(
      this.config.texts.connectTitle,
      {
        modal: true,
        detail: this.config.texts.connectDetail(
          shown(file),
          port,
          `${path.basename(file)}.nightping.bak`,
        ),
      },
      connect,
    );
    if (choice !== connect) return;
    if (await this.rewrite(file, (text) => connectedText(this.config.hooks, text, port))) {
      void vscode.window.showInformationMessage(this.config.texts.connected);
    }
  }

  async disconnect(): Promise<void> {
    await this.refresh();
    // Nothing to remove: leave the file exactly as it is.
    if (this.hooks === 'disconnected' || this.hooks === 'invalid') {
      void vscode.window.showInformationMessage(this.config.texts.notConnected);
      return;
    }
    const file = this.config.file();
    const disconnect = vscode.l10n.t('Disconnect');
    const choice = await vscode.window.showWarningMessage(
      this.config.texts.disconnectTitle,
      {
        modal: true,
        detail: this.config.ownFile
          ? vscode.l10n.t(
              'Nightping deletes its own file, {0}. Other hooks and settings stay as they are.',
              shown(file),
            )
          : vscode.l10n.t(
              'Nightping removes only its own hooks from {0}, after saving a copy as {1}. Other hooks and settings stay as they are.',
              shown(file),
              `${path.basename(file)}.nightping.bak`,
            ),
      },
      disconnect,
    );
    if (choice !== disconnect) return;
    if (this.config.ownFile) await this.remove(file);
    else await this.rewrite(file, (text) => disconnectedText(this.config.hooks, text));
  }

  /** Puts the hooks on the clipboard, for people who add them by hand or ask the agent to. */
  async copySettings(): Promise<void> {
    await vscode.env.clipboard.writeText(
      `${JSON.stringify(hookSettings(this.config.hooks, currentPort()), null, 2)}\n`,
    );
    const file = shown(this.config.file());
    void vscode.window.showInformationMessage(
      this.config.ownFile
        ? vscode.l10n.t('Copied the hooks. Save them as {0}.', file)
        : vscode.l10n.t('Copied the hooks. Add them under "hooks" in {0}.', file),
    );
  }

  /** A payload that the agent's hooks posted to the endpoint. */
  receive(payload: unknown): void {
    const hook = this.config.read(payload);
    const event = hook && this.turns.event(this.config.agent, hook);
    if (event) this.notify(event);
  }

  onDidChange(listener: () => void): vscode.Disposable {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  /** Tells the panel and the context keys that the hooks or the endpoint changed. */
  changed(): void {
    for (const listener of this.listeners) listener();
  }

  dispose(): void {
    this.endpoint.need(this.config.agent, undefined);
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
      if (text !== undefined && !this.config.ownFile) {
        await fs.writeFile(`${file}.nightping.bak`, text, 'utf8');
      }
      await fs.writeFile(file, next, 'utf8');
    } catch (error) {
      return this.failed(error);
    }
    await this.refresh();
    return true;
  }

  private async remove(file: string): Promise<void> {
    try {
      await fs.rm(file, { force: true });
    } catch (error) {
      this.failed(error);
      return;
    }
    await this.refresh();
  }

  private failed(error: unknown): false {
    void vscode.window.showErrorMessage(
      vscode.l10n.t(
        'Could not change {0}: {1}',
        shown(this.config.file()),
        error instanceof Error ? error.message : String(error),
      ),
    );
    return false;
  }
}
