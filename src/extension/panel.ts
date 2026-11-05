import * as vscode from 'vscode';
import type {
  AgentKind,
  AppStore,
  DestinationView,
  GuideLink,
  HostToWebviewMessage,
  PanelState,
  SetupWay,
  WebviewToHostMessage,
} from '../shared/protocol';
import { displayName, isName, isServerUrl, isToken, isTopic, normalizeServer } from './config';
import {
  currentDestinations,
  isTokenKey,
  saveDestination,
  setEnabled,
  tokenKey,
} from './destinations';
import { samplePreviews } from './format';
import type { History } from './history';
import { readMessage } from './message';
import { isRunning, type Message } from './ntfy';
import type { Pauser } from './pause';
import type { AgentBridge } from './agentBridge';
import { settingFor } from './prefs';
import { currentPrefs, type Sender, type SendOutcome } from './sender';
import { routeFor, tailscaleStatus } from './tailscale';
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
const GUIDE_PAGES: Record<GuideLink, string> = {
  'tailscale-download': 'https://tailscale.com/download',
  'tailscale-dns': 'https://login.tailscale.com/admin/dns',
  'ntfy-install': 'https://docs.ntfy.sh/install/',
};
/** Longer text is not a topic, a command or a prompt of the guide. */
const COPY_LIMIT = 8000;

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

  /** With `way`, opens that way's guide, as the Command Palette asks for Tailscale. */
  static show(context: PanelContext, way?: SetupWay): void {
    if (Panel.current) {
      Panel.current.panel.reveal();
      if (way) Panel.current.openGuide(way);
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
    if (way) Panel.current.openGuide(way);
  }

  private readonly disposables: vscode.Disposable[] = [];
  private ready = false;
  private updating = 0;
  /** A guide asked for before the panel was ready. */
  private pendingWay: SetupWay | undefined;

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
        if (isTokenKey(event.key)) void this.update();
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
        if (this.pendingWay) this.openGuide(this.pendingWay);
        return;
      case 'save': {
        // The panel checks the same rules; this keeps a bad message from reaching the settings.
        const { previous, name, server, topic, token } = message;
        if (
          (previous !== undefined && typeof previous !== 'string') ||
          typeof name !== 'string' ||
          typeof server !== 'string' ||
          typeof topic !== 'string' ||
          typeof token !== 'string' ||
          !isName(name) ||
          !isServerUrl(normalizeServer(server)) ||
          !isTopic(topic.trim()) ||
          (token.trim() !== '' && !isToken(token.trim()))
        ) {
          return;
        }
        const saved = await saveDestination(
          this.context.secrets,
          { name, server, topic, token },
          previous,
        );
        if (!saved.ok) {
          this.post({
            type: 'notSaved',
            error: panelStrings(vscode.l10n.t).destinations.duplicate,
          });
          return;
        }
        this.post({ type: 'saved' });
        if (message.test === true) await this.sendTest(saved.key);
        return;
      }
      case 'sendTest':
        await this.sendTest(typeof message.key === 'string' ? message.key : undefined);
        return;
      case 'removeDestination':
        // The command asks first, as it does from the Command Palette.
        if (typeof message.key === 'string') {
          await vscode.commands.executeCommand('nightping.removeDestination', message.key);
        }
        return;
      case 'setEnabled':
        if (typeof message.key === 'string' && typeof message.enabled === 'boolean') {
          await setEnabled(message.key, message.enabled);
        }
        return;
      case 'findTailscale':
        this.post({ type: 'tailscale', status: await tailscaleStatus() });
        return;
      case 'checkServer': {
        // Only an address the user chose in the guide, and only its health check.
        const server = typeof message.server === 'string' ? normalizeServer(message.server) : '';
        if (!isServerUrl(server)) return;
        // On the server computer itself, its own ntfy: Windows does not reach its own address.
        const routes = await this.context.sender.routes.get([server], true);
        const running = await isRunning(routeFor(routes, server) ?? server);
        this.post({ type: 'serverCheck', server, running });
        return;
      }
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
      case 'removeToken': {
        const entry = currentDestinations().entries.find((item) => item.key === message.key);
        if (entry) await this.context.secrets.delete(tokenKey(entry.server));
        return;
      }
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
      case 'openGuide': {
        const page = Object.hasOwn(GUIDE_PAGES, message.link)
          ? GUIDE_PAGES[message.link]
          : undefined;
        if (page) await vscode.env.openExternal(vscode.Uri.parse(page));
        return;
      }
      case 'copy':
        if (typeof message.text === 'string' && message.text.length <= COPY_LIMIT) {
          await vscode.env.clipboard.writeText(message.text.trim());
        }
        return;
    }
  }

  private openGuide(way: SetupWay): void {
    if (this.ready) {
      this.pendingWay = undefined;
      this.post({ type: 'guide', way });
    } else {
      this.pendingWay = way;
    }
  }

  /** To one destination, or without `key` to every one that is on. */
  private async sendTest(key?: string): Promise<void> {
    this.post({ type: 'busy', busy: true });
    try {
      const outcome = await this.context.sender.send(testMessage(vscode.l10n.t), key);
      const entry = key
        ? currentDestinations().entries.find((item) => item.key === key)
        : undefined;
      const refused =
        outcome.kind === 'failed' &&
        outcome.failures.length === 1 &&
        outcome.failures[0].result.reason === 'unauthorized'
          ? outcome.failures[0].destination.key
          : undefined;
      this.post({
        type: 'result',
        time: Date.now(),
        error: this.reason(outcome),
        ...(entry ? { to: displayName(entry) } : {}),
        ...(refused ? { needsToken: refused } : {}),
      });
    } finally {
      this.post({ type: 'busy', busy: false });
    }
  }

  /** Sends, and says why when nothing went out. */
  private async deliver(message: Message): Promise<string | undefined> {
    return this.reason(await this.context.sender.send(message));
  }

  private reason(outcome: SendOutcome): string | undefined {
    switch (outcome.kind) {
      case 'sent':
        return undefined;
      case 'failed':
        return outcome.text;
      case 'not-ready':
        return notReadyText(vscode.l10n.t, outcome.state);
    }
  }

  private async update(): Promise<void> {
    if (!this.ready) return;
    // A slower, older update must not replace a newer one.
    const id = ++this.updating;
    const destinations = currentDestinations();
    const views: DestinationView[] = [];
    for (const entry of destinations.entries) {
      const hasToken = (await this.context.secrets.get(tokenKey(entry.server))) !== undefined;
      const { key, name, server, topic, enabled, problem } = entry;
      views.push({ key, name, server, topic, enabled, hasToken, ...(problem ? { problem } : {}) });
    }
    const state: PanelState = {
      destinations: views,
      status: destinations.kind,
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
