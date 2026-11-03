import * as vscode from 'vscode';
import {
  normalizeServer,
  readDestination,
  type Destination,
  type DestinationState,
} from './config';
import type { History } from './history';
import { publish, type Message, type PublishResult } from './ntfy';
import { failureText } from './texts';

/** SecretStorage key; secrets are already kept apart per extension. */
export const TOKEN_KEY = 'accessToken';

export type SendOutcome =
  | { kind: 'not-ready'; state: Exclude<DestinationState, { kind: 'ready' }> }
  | { kind: 'sent' }
  | {
      kind: 'failed';
      result: Exclude<PublishResult, { ok: true }>;
      destination: Destination;
      hasToken: boolean;
      /** The reason, as the history and the panel show it. */
      text: string;
    };

/** Writes the server and topic to the user settings, and a token when one is given. */
export async function saveDestination(
  secrets: vscode.SecretStorage,
  server: string,
  topic: string,
  token: string,
): Promise<void> {
  const values = vscode.workspace.getConfiguration('nightping');
  await values.update('server', normalizeServer(server), vscode.ConfigurationTarget.Global);
  await values.update('topic', topic.trim(), vscode.ConfigurationTarget.Global);
  if (token.trim() !== '') {
    await secrets.store(TOKEN_KEY, token.trim());
  }
}

export function currentDestination(): DestinationState {
  const values = vscode.workspace.getConfiguration('nightping');
  return readDestination((key) => values.get(key));
}

/** Sends to the server and topic in the settings, and writes each try to the history. */
export class Sender {
  constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly history: History,
  ) {}

  async send(message: Message): Promise<SendOutcome> {
    const state = currentDestination();
    if (state.kind !== 'ready') {
      return { kind: 'not-ready', state };
    }
    const token = await this.secrets.get(TOKEN_KEY);
    const result = await publish(state.destination, message, { token });
    const entry = { time: Date.now(), title: message.title, message: message.message };
    if (result.ok) {
      await this.history.add(entry);
      return { kind: 'sent' };
    }
    const hasToken = token !== undefined;
    const text = failureText(vscode.l10n.t, result, state.destination.server, hasToken);
    await this.history.add({ ...entry, error: text });
    return { kind: 'failed', result, destination: state.destination, hasToken, text };
  }
}
