// GitHub Copilot: agent mode in VS Code and Copilot CLI read the same hooks folder, so one file
// of command hooks covers both.
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { windowsCurl, type AgentConfig } from '../agentBridge';
import { readHook } from '../claude/payload';
import { copilotHooks } from './settings';

/**
 * Nightping's file in the user's Copilot hooks folder. VS Code reads `~/.copilot/hooks` even
 * where `COPILOT_HOME` moves Copilot CLI's folder, so this one stays in the home folder.
 */
export function hooksFile(): string {
  return path.join(os.homedir(), '.copilot', 'hooks', 'nightping.json');
}

export function copilotConfig(): AgentConfig {
  return {
    agent: 'copilot',
    file: hooksFile,
    ownFile: true,
    hooks: copilotHooks(windowsCurl()),
    // For the events Nightping asks for, Copilot sends what Claude Code's hooks send.
    read: readHook,
    texts: {
      connectTitle: vscode.l10n.t('Connect GitHub Copilot to Nightping?'),
      connectDetail: (file, port) =>
        vscode.l10n.t(
          'Nightping adds its own hooks file, {0}, which Copilot in VS Code and Copilot CLI both read. Its hooks send these events to Nightping on this computer only (port {1}): when you send a prompt, when Copilot finishes, and when Copilot CLI asks for your approval. Copilot waits for each hook, usually for less than half a second.',
          file,
          port,
        ),
      connected: vscode.l10n.t('GitHub Copilot is connected.'),
      notConnected: vscode.l10n.t('GitHub Copilot is not connected.'),
      disconnectTitle: vscode.l10n.t('Disconnect GitHub Copilot from Nightping?'),
    },
  };
}
