import * as vscode from 'vscode';
import { readDestination } from './config';
import { StatusBar } from './statusBar';

export function activate(context: vscode.ExtensionContext): void {
  const status = new StatusBar();
  const refresh = () => {
    const settings = vscode.workspace.getConfiguration('nightping');
    status.show(readDestination((key) => settings.get(key)));
  };
  refresh();

  context.subscriptions.push(
    status,
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('nightping')) {
        refresh();
      }
    }),
    vscode.commands.registerCommand('nightping.openSettings', () =>
      vscode.commands.executeCommand(
        'workbench.action.openSettings',
        '@ext:mbkdevstudio.nightping',
      ),
    ),
  );
}

export function deactivate(): void {}
