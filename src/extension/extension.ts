import * as vscode from 'vscode';
import { clearToken, pause, resume, sendTest, setToken, setUp, type Services } from './commands';
import { ClaudeBridge } from './claude/bridge';
import type { FinishedEvent } from './events';
import { decide } from './filter';
import { formatEvent } from './format';
import { History } from './history';
import { Panel } from './panel';
import { Pauser } from './pause';
import { currentDestination, currentPrefs, Sender } from './sender';
import { watchSources } from './sources';
import { StatusBar } from './statusBar';

export function activate(context: vscode.ExtensionContext): void {
  const { secrets } = context;
  const history = new History(context.globalState);
  const sender = new Sender(secrets, history);
  const pauser = new Pauser(context.globalState);
  // VS Code's runs and Claude Code's turns go through the same filter and format.
  const notify = (event: FinishedEvent) => {
    const prefs = currentPrefs();
    const paused = pauser.current() !== undefined;
    if (decide(event, prefs, vscode.window.state, paused) !== 'send') return;
    void sender.send(formatEvent(vscode.l10n.t, event, prefs.content, vscode.workspace.name));
  };
  const claude = new ClaudeBridge(notify);
  // Shows Connect or Disconnect in the Command Palette, whichever applies.
  claude.onDidChange(() =>
    vscode.commands.executeCommand('setContext', 'nightping.claudeHooks', claude.status().hooks),
  );
  const services: Services = { secrets, sender, pauser, claude };
  const panel = { extensionUri: context.extensionUri, secrets, history, sender, pauser, claude };

  const status = new StatusBar();
  const refresh = () => {
    const paused = pauser.current();
    status.show(currentDestination(), paused, history.entries()[0]);
    // Shows Pause or Resume in the Command Palette, whichever applies.
    void vscode.commands.executeCommand('setContext', 'nightping.paused', paused !== undefined);
  };

  context.subscriptions.push(
    status,
    pauser,
    pauser.onDidChange(refresh),
    history.onDidChange(refresh),
    claude,
    watchSources(notify),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('nightping')) {
        refresh();
      }
    }),
    // Another window may have paused or resumed in the meantime.
    vscode.window.onDidChangeWindowState((state) => {
      if (!state.focused) return;
      pauser.refresh();
      // The settings file may have changed while VS Code was in the background.
      void claude.refresh();
    }),
    vscode.commands.registerCommand('nightping.open', () => Panel.show(panel)),
    vscode.commands.registerCommand('nightping.setUp', () => setUp(services)),
    vscode.commands.registerCommand('nightping.sendTest', () => sendTest(services)),
    vscode.commands.registerCommand('nightping.setToken', () => setToken(services)),
    vscode.commands.registerCommand('nightping.clearToken', () => clearToken(services)),
    vscode.commands.registerCommand('nightping.pause', (minutes?: unknown) =>
      pause(services, minutes),
    ),
    vscode.commands.registerCommand('nightping.resume', () => resume(services)),
    vscode.commands.registerCommand('nightping.connectClaudeCode', () => claude.connect()),
    vscode.commands.registerCommand('nightping.disconnectClaudeCode', () => claude.disconnect()),
    vscode.commands.registerCommand('nightping.copyClaudeCodeSettings', () =>
      claude.copySettings(),
    ),
    vscode.commands.registerCommand('nightping.openSettings', () =>
      vscode.commands.executeCommand(
        'workbench.action.openSettings',
        '@ext:mbkdevstudio.nightping',
      ),
    ),
  );
  // Also starts the timer of a pause left over from an earlier session.
  pauser.refresh();
  // Starts the endpoint when Claude Code's settings have Nightping's hooks.
  void claude.refresh();
}

export function deactivate(): void {}
