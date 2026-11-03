import * as vscode from 'vscode';
import { clearToken, sendTest, setToken, setUp, type Services } from './commands';
import { History } from './history';
import { Panel } from './panel';
import { currentDestination, Sender } from './sender';
import { StatusBar } from './statusBar';

export function activate(context: vscode.ExtensionContext): void {
  const { secrets } = context;
  const history = new History(context.globalState);
  const sender = new Sender(secrets, history);
  const services: Services = { secrets, sender };
  const panel = { extensionUri: context.extensionUri, secrets, history, sender };

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
    vscode.commands.registerCommand('nightping.open', () => Panel.show(panel)),
    vscode.commands.registerCommand('nightping.setUp', () => setUp(services)),
    vscode.commands.registerCommand('nightping.sendTest', () => sendTest(services)),
    vscode.commands.registerCommand('nightping.setToken', () => setToken(services)),
    vscode.commands.registerCommand('nightping.clearToken', () => clearToken(services)),
    vscode.commands.registerCommand('nightping.openSettings', () =>
      vscode.commands.executeCommand(
        'workbench.action.openSettings',
        '@ext:mbkdevstudio.nightping',
      ),
    ),
  );
}

export function deactivate(): void {}
