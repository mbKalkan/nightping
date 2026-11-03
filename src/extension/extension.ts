import * as vscode from 'vscode';
import { clearToken, currentDestination, sendTest, setToken, setUp } from './commands';
import { StatusBar } from './statusBar';

export function activate(context: vscode.ExtensionContext): void {
  const { secrets } = context;
  const status = new StatusBar();
  const refresh = () => status.show(currentDestination());
  refresh();

  context.subscriptions.push(
    status,
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('nightping')) {
        refresh();
      }
    }),
    vscode.commands.registerCommand('nightping.setUp', () => setUp(secrets)),
    vscode.commands.registerCommand('nightping.sendTest', () => sendTest(secrets)),
    vscode.commands.registerCommand('nightping.setToken', () => setToken(secrets)),
    vscode.commands.registerCommand('nightping.clearToken', () => clearToken(secrets)),
    vscode.commands.registerCommand('nightping.openSettings', () =>
      vscode.commands.executeCommand(
        'workbench.action.openSettings',
        '@ext:mbkdevstudio.nightping',
      ),
    ),
  );
}

export function deactivate(): void {}
