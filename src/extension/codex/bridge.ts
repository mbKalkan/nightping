// OpenAI Codex (its CLI and its VS Code extension): command hooks in hooks.json.
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { AgentConfig } from '../agentBridge';
import { readCodexHook } from './payload';
import { codexHooks } from './settings';

/** Codex's hooks file. An absolute `CODEX_HOME` moves it, as it moves the rest of Codex's files. */
export function hooksFile(): string {
  const configured = process.env.CODEX_HOME;
  const dir =
    configured && path.isAbsolute(configured) ? configured : path.join(os.homedir(), '.codex');
  return path.join(dir, 'hooks.json');
}

function windowsCurl(): string {
  return path.win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'curl.exe');
}

export function codexConfig(): AgentConfig {
  return {
    agent: 'codex',
    file: hooksFile,
    hooks: codexHooks(windowsCurl()),
    read: readCodexHook,
    texts: {
      connectTitle: vscode.l10n.t('Connect Codex to Nightping?'),
      connectDetail: (file, port, backup) =>
        vscode.l10n.t(
          'Nightping adds three hooks to {0}: when you send a prompt, when Codex finishes, and when it asks for your approval. They send these events to Nightping on this computer only (port {1}) and Codex does not wait for them. A copy of the file is saved first as {2}. Codex runs new hooks only after you trust them: run /hooks in Codex once.',
          file,
          port,
          backup,
        ),
      connected: vscode.l10n.t(
        'Codex is connected. Run /hooks in Codex once and trust the Nightping hooks; until then Codex does not run them.',
      ),
      notConnected: vscode.l10n.t('Codex is not connected.'),
      disconnectTitle: vscode.l10n.t('Disconnect Codex from Nightping?'),
    },
  };
}
