// Claude Code: HTTP hooks in its user settings, which post straight to the endpoint.
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { AgentConfig } from '../agentBridge';
import { readHook } from './payload';
import { CLAUDE_HOOKS } from './settings';

/**
 * Claude Code's user settings. An absolute `CLAUDE_CONFIG_DIR` moves them, as it does for Claude
 * Code's VS Code extension.
 */
export function settingsFile(): string {
  const configured = process.env.CLAUDE_CONFIG_DIR;
  const dir =
    configured && path.isAbsolute(configured) ? configured : path.join(os.homedir(), '.claude');
  return path.join(dir, 'settings.json');
}

export function claudeConfig(): AgentConfig {
  return {
    agent: 'claude',
    file: settingsFile,
    hooks: CLAUDE_HOOKS,
    read: readHook,
    texts: {
      connectTitle: vscode.l10n.t('Connect Claude Code to Nightping?'),
      connectDetail: (file, port, backup) =>
        vscode.l10n.t(
          'Nightping adds three hooks to {0}: when you send a prompt, when Claude finishes, and when it needs you. They send these events to Nightping on this computer only (port {1}). A copy of the file is saved first as {2}. If you already get Claude Code notifications another way, turn that off, or they will arrive twice.',
          file,
          port,
          backup,
        ),
      connected: vscode.l10n.t(
        'Claude Code is connected. Its next turn notifies you when you are away.',
      ),
      notConnected: vscode.l10n.t('Claude Code is not connected.'),
      disconnectTitle: vscode.l10n.t('Disconnect Claude Code from Nightping?'),
    },
  };
}
