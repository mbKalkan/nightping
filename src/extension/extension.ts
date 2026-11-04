import * as vscode from 'vscode';
import {
  clearToken,
  pause,
  resume,
  send,
  sendTest,
  setToken,
  setUp,
  type Services,
} from './commands';
import { AgentBridge } from './agentBridge';
import { claudeConfig } from './claude/bridge';
import { codexConfig } from './codex/bridge';
import { copilotConfig } from './copilot/bridge';
import type { FinishedEvent } from './events';
import { Endpoint } from './endpoint';
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
  // VS Code's runs and the agents' turns go through the same filter and format.
  const notify = (event: FinishedEvent) => {
    const prefs = currentPrefs();
    const paused = pauser.current() !== undefined;
    if (decide(event, prefs, vscode.window.state, paused) !== 'send') return;
    void sender.send(formatEvent(vscode.l10n.t, event, prefs.content, vscode.workspace.name));
  };
  // One endpoint for every agent's hooks; each agent posts to its own path.
  const endpoint = new Endpoint(
    (agent, payload) => agents[agent].receive(payload),
    () => {
      for (const bridge of Object.values(agents)) bridge.changed();
    },
  );
  const claude = new AgentBridge(claudeConfig(), notify, endpoint);
  const codex = new AgentBridge(codexConfig(), notify, endpoint);
  const copilot = new AgentBridge(copilotConfig(), notify, endpoint);
  const agents = { claude, codex, copilot };
  // Shows Connect or Disconnect in the Command Palette, whichever applies.
  for (const [agent, bridge] of Object.entries(agents)) {
    bridge.onDidChange(() =>
      vscode.commands.executeCommand(
        'setContext',
        `nightping.${agent}Hooks`,
        bridge.status().hooks,
      ),
    );
  }
  const services: Services = { secrets, sender, pauser, claude };
  const panel = {
    extensionUri: context.extensionUri,
    secrets,
    history,
    sender,
    pauser,
    claude,
    codex,
    copilot,
  };

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
    ...Object.values(agents),
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
      // The agents' files may have changed while VS Code was in the background.
      for (const bridge of Object.values(agents)) void bridge.refresh();
    }),
    vscode.commands.registerCommand('nightping.open', () => Panel.show(panel)),
    vscode.commands.registerCommand('nightping.setUp', () => setUp(services)),
    vscode.commands.registerCommand('nightping.sendTest', () => sendTest(services)),
    vscode.commands.registerCommand('nightping.send', (input?: unknown) => send(services, input)),
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
    vscode.commands.registerCommand('nightping.connectCodex', () => codex.connect()),
    vscode.commands.registerCommand('nightping.disconnectCodex', () => codex.disconnect()),
    vscode.commands.registerCommand('nightping.copyCodexSettings', () => codex.copySettings()),
    vscode.commands.registerCommand('nightping.connectCopilot', () => copilot.connect()),
    vscode.commands.registerCommand('nightping.disconnectCopilot', () => copilot.disconnect()),
    vscode.commands.registerCommand('nightping.copyCopilotSettings', () => copilot.copySettings()),
    vscode.commands.registerCommand('nightping.openSettings', () =>
      vscode.commands.executeCommand(
        'workbench.action.openSettings',
        '@ext:mbkdevstudio.nightping',
      ),
    ),
  );
  // Also starts the timer of a pause left over from an earlier session.
  pauser.refresh();
  // Starts the endpoint when an agent's file has Nightping's hooks.
  for (const bridge of Object.values(agents)) void bridge.refresh();
}

export function deactivate(): void {}
