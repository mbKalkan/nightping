import * as vscode from 'vscode';
import { clearToken, pause, resume, sendTest, setToken, setUp, type Services } from './commands';
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
  const services: Services = { secrets, sender, pauser };
  const panel = { extensionUri: context.extensionUri, secrets, history, sender, pauser };

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
    watchSources((event) => {
      const prefs = currentPrefs();
      const paused = pauser.current() !== undefined;
      if (decide(event, prefs, vscode.window.state, paused) !== 'send') return;
      void sender.send(formatEvent(vscode.l10n.t, event, prefs.content, vscode.workspace.name));
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('nightping')) {
        refresh();
      }
    }),
    // Another window may have paused or resumed in the meantime.
    vscode.window.onDidChangeWindowState((state) => {
      if (state.focused) pauser.refresh();
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
    vscode.commands.registerCommand('nightping.openSettings', () =>
      vscode.commands.executeCommand(
        'workbench.action.openSettings',
        '@ext:mbkdevstudio.nightping',
      ),
    ),
  );
  // Also starts the timer of a pause left over from an earlier session.
  pauser.refresh();
}

export function deactivate(): void {}
