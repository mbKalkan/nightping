import * as vscode from 'vscode';
import type {
  AgentKind,
  AppStore,
  HostToWebviewMessage,
  PanelState,
  WebviewToHostMessage,
} from '../shared/protocol';
import { isServerUrl, isToken, isTopic, normalizeServer } from './config';
import { samplePreviews } from './format';
import type { History } from './history';
import { readMessage } from './message';
import type { Message } from './ntfy';
import type { Pauser } from './pause';
import type { AgentBridge } from './agentBridge';
import { settingFor } from './prefs';
import {
  currentDestination,
  currentPrefs,
  saveDestination,
  TOKEN_KEY,
  type Sender,
} from './sender';
import { notReadyText, panelStrings, testMessage } from './texts';
import { buildWebviewHtml } from './webviewHtml';

export const PANEL_VIEW_TYPE = 'nightping.panel';

/** The commands behind each agent card's buttons. */
const AGENT_COMMANDS: Record<
  AgentKind,
  Record<'connectAgent' | 'disconnectAgent' | 'copyAgentSettings', string>
> = {
  claude: {
    connectAgent: 'nightping.connectClaudeCode',
    disconnectAgent: 'nightping.disconnectClaudeCode',
    copyAgentSettings: 'nightping.copyClaudeCodeSettings',
  },
  codex: {
    connectAgent: 'nightping.connectCodex',
    disconnectAgent: 'nightping.disconnectCodex',
    copyAgentSettings: 'nightping.copyCodexSettings',
  },
  copilot: {
    connectAgent: 'nightping.connectCopilot',
    disconnectAgent: 'nightping.disconnectCopilot',
    copyAgentSettings: 'nightping.copyCopilotSettings',
  },
};

const SHELL_INTEGRATION_HELP = 'https://code.visualstudio.com/docs/terminal/shell-integration';
/** The ntfy app in each store, as the README links them. */
const APP_STORE_PAGES: Record<AppStore, string> = {
  'google-play': 'https://play.google.com/store/apps/details?id=io.heckel.ntfy',
  'f-droid': 'https://f-droid.org/en/packages/io.heckel.ntfy/',
  'app-store': 'https://apps.apple.com/us/app/ntfy/id1625396347',
};

export interface PanelContext {
  extensionUri: vscode.Uri;
  secrets: vscode.SecretStorage;
  history: History;
  sender: Sender;
  pauser: Pauser;
  claude: AgentBridge;
  codex: AgentBridge;
  copilot: AgentBridge;
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
      context.pauser.onDidChange(() => void this.update()),
      context.claude.onDidChange(() => void this.update()),
      context.codex.onDidChange(() => void this.update()),
      context.copilot.onDidChange(() => void this.update()),
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
      case 'send': {
        // The panel waits for an answer, so even a message it should not have sent gets one.
        const typed = readMessage(
          vscode.l10n.t,
          typeof message.message === 'string' ? message.message : '',
        );
        const error = typed.ok ? await this.deliver(typed.message) : typed.problem;
        this.post({ type: 'messageResult', time: Date.now(), error });
        return;
      }
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
      case 'pause':
        await vscode.commands.executeCommand('nightping.pause');
        return;
      case 'resume':
        await vscode.commands.executeCommand('nightping.resume');
        return;
      case 'connectAgent':
      case 'disconnectAgent':
      case 'copyAgentSettings': {
        const command = AGENT_COMMANDS[message.agent]?.[message.type];
        if (command) await vscode.commands.executeCommand(command);
        return;
      }
      case 'openShellIntegrationHelp':
        await vscode.env.openExternal(vscode.Uri.parse(SHELL_INTEGRATION_HELP));
        return;
      case 'openAppStore': {
        // Only the addresses above: the panel names a store, never a link.
        const page = Object.hasOwn(APP_STORE_PAGES, message.store)
          ? APP_STORE_PAGES[message.store]
          : undefined;
        if (page) await vscode.env.openExternal(vscode.Uri.parse(page));
        return;
      }
      case 'copyTopic':
        if (typeof message.topic === 'string' && isTopic(message.topic.trim())) {
          await vscode.env.clipboard.writeText(message.topic.trim());
        }
        return;
    }
  }

  private async sendTest(): Promise<void> {
    this.post({ type: 'busy', busy: true });
    try {
      const error = await this.deliver(testMessage(vscode.l10n.t));
      this.post({ type: 'result', time: Date.now(), error });
    } finally {
      this.post({ type: 'busy', busy: false });
    }
  }

  /** Sends, and says why when nothing went out. */
  private async deliver(message: Message): Promise<string | undefined> {
    const outcome = await this.context.sender.send(message);
    switch (outcome.kind) {
      case 'sent':
        return undefined;
      case 'failed':
        return outcome.text;
      case 'not-ready':
        return notReadyText(vscode.l10n.t, outcome.state.kind);
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
      pause: this.context.pauser.current(),
      prefs: currentPrefs(),
      previews: samplePreviews(vscode.l10n.t, vscode.workspace.name),
      terminals: {
        open: vscode.window.terminals.length,
        reporting: vscode.window.terminals.filter((t) => t.shellIntegration !== undefined).length,
      },
      claude: this.context.claude.status(),
      codex: this.context.codex.status(),
      copilot: this.context.copilot.status(),
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
