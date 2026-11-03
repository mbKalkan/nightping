import * as vscode from 'vscode';
import type { HostToWebviewMessage, PanelState, WebviewToHostMessage } from '../shared/protocol';
import { isServerUrl, isToken, isTopic, normalizeServer } from './config';
import { samplePreviews } from './format';
import type { History } from './history';
import { settingFor } from './prefs';
import {
  currentDestination,
  currentPrefs,
  saveDestination,
  TOKEN_KEY,
  type Sender,
} from './sender';
import { panelStrings, testMessage } from './texts';
import { buildWebviewHtml } from './webviewHtml';

export const PANEL_VIEW_TYPE = 'nightping.panel';

const SHELL_INTEGRATION_HELP = 'https://code.visualstudio.com/docs/terminal/shell-integration';

export interface PanelContext {
  extensionUri: vscode.Uri;
  secrets: vscode.SecretStorage;
  history: History;
  sender: Sender;
}

/** The one Nightping panel: shown again rather than opened twice. */
export class Panel {
  private static current: Panel | undefined;

  static show(context: PanelContext): void {
    if (Panel.current) {
      Panel.current.panel.reveal();
      return;
    }
    const dist = vscode.Uri.joinPath(context.extensionUri, 'dist');
    const panel = vscode.window.createWebviewPanel(
      PANEL_VIEW_TYPE,
      'Nightping',
      vscode.ViewColumn.Active,
      { enableScripts: true, localResourceRoots: [dist], retainContextWhenHidden: true },
    );
    Panel.current = new Panel(panel, dist, context);
  }

  private readonly disposables: vscode.Disposable[] = [];
  private ready = false;
  private updating = 0;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    dist: vscode.Uri,
    private readonly context: PanelContext,
  ) {
    const { webview } = panel;
    webview.html = buildWebviewHtml({
      cspSource: webview.cspSource,
      scriptUri: webview.asWebviewUri(vscode.Uri.joinPath(dist, 'webview', 'main.js')).toString(),
      styleUri: webview.asWebviewUri(vscode.Uri.joinPath(dist, 'webview', 'main.css')).toString(),
      lang: vscode.env.language,
    });
    this.disposables.push(
      webview.onDidReceiveMessage((message: WebviewToHostMessage) => void this.receive(message)),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('nightping')) void this.update();
      }),
      context.secrets.onDidChange((event) => {
        if (event.key === TOKEN_KEY) void this.update();
      }),
      context.history.onDidChange(() => void this.update()),
      vscode.window.onDidOpenTerminal(() => void this.update()),
      vscode.window.onDidCloseTerminal(() => void this.update()),
      vscode.window.onDidChangeTerminalShellIntegration(() => void this.update()),
      panel.onDidDispose(() => this.dispose()),
    );
  }

  private async receive(message: WebviewToHostMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        this.ready = true;
        this.post({
          type: 'init',
          locale: vscode.env.language,
          strings: panelStrings(vscode.l10n.t),
        });
        await this.update();
        return;
      case 'save': {
        // The panel checks the same rules; this keeps a bad message from reaching the settings.
        const { server, topic, token } = message;
        if (
          typeof server !== 'string' ||
          typeof topic !== 'string' ||
          typeof token !== 'string' ||
          !isServerUrl(normalizeServer(server)) ||
          !isTopic(topic.trim()) ||
          (token.trim() !== '' && !isToken(token.trim()))
        ) {
          return;
        }
        await saveDestination(this.context.secrets, server, topic, token);
        this.post({ type: 'saved' });
        if (message.test === true) await this.sendTest();
        return;
      }
      case 'sendTest':
        await this.sendTest();
        return;
      case 'removeToken':
        await this.context.secrets.delete(TOKEN_KEY);
        return;
      case 'clearHistory':
        await this.context.history.clear();
        return;
      case 'openSettings':
        await vscode.commands.executeCommand('nightping.openSettings');
        return;
      case 'setPref': {
        const setting = settingFor(message.change);
        if (!setting) return;
        await vscode.workspace
          .getConfiguration('nightping')
          .update(setting.key, setting.value, vscode.ConfigurationTarget.Global);
        return;
      }
      case 'openShellIntegrationHelp':
        await vscode.env.openExternal(vscode.Uri.parse(SHELL_INTEGRATION_HELP));
        return;
    }
  }

  private async sendTest(): Promise<void> {
    this.post({ type: 'busy', busy: true });
    try {
      const outcome = await this.context.sender.send(testMessage(vscode.l10n.t));
      const time = Date.now();
      if (outcome.kind === 'sent') {
        this.post({ type: 'result', time });
      } else if (outcome.kind === 'failed') {
        this.post({ type: 'result', time, error: outcome.text });
      } else {
        this.post({
          type: 'result',
          time,
          error:
            outcome.state.kind === 'incomplete'
              ? vscode.l10n.t('Nightping is not set up yet.')
              : vscode.l10n.t('The ntfy server or topic in the settings is not valid.'),
        });
      }
    } finally {
      this.post({ type: 'busy', busy: false });
    }
  }

  private async update(): Promise<void> {
    if (!this.ready) return;
    // A slower, older update must not replace a newer one.
    const id = ++this.updating;
    const values = vscode.workspace.getConfiguration('nightping');
    const destination = currentDestination();
    const state: PanelState = {
      server: values.get<string>('server') ?? '',
      topic: values.get<string>('topic') ?? '',
      hasToken: (await this.context.secrets.get(TOKEN_KEY)) !== undefined,
      status: destination.kind,
      history: this.context.history.entries(),
      prefs: currentPrefs(),
      previews: samplePreviews(vscode.l10n.t, vscode.workspace.name),
      terminals: {
        open: vscode.window.terminals.length,
        reporting: vscode.window.terminals.filter((t) => t.shellIntegration !== undefined).length,
      },
    };
    if (id === this.updating) this.post({ type: 'state', state });
  }

  private post(message: HostToWebviewMessage): void {
    void this.panel.webview.postMessage(message);
  }

  private dispose(): void {
    Panel.current = undefined;
    for (const disposable of this.disposables.splice(0)) disposable.dispose();
  }
}
