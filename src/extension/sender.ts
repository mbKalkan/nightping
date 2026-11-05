import * as vscode from 'vscode';
import type { DestinationsKind } from './config';
import { deliver, deliveryError, type Failure } from './delivery';
import { currentDestinations, tokenKey } from './destinations';
import type { NotifyPrefs } from '../shared/protocol';
import type { History } from './history';
import { publish, type Message } from './ntfy';
import { readPrefs } from './prefs';

export type SendOutcome =
  | { kind: 'not-ready'; state: Exclude<DestinationsKind, 'ready'> }
  | { kind: 'sent'; count: number }
  | {
      kind: 'failed';
      failures: Failure[];
      /** How many destinations got it all the same. */
      sent: number;
      /** The reason, as the history and the panel show it. */
      text: string;
    };

export function currentPrefs(): NotifyPrefs {
  const values = vscode.workspace.getConfiguration('nightping');
  return readPrefs((key) => values.get(key));
}

/** Sends to the destinations in the settings, and writes each try to the history. */
export class Sender {
  constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly history: History,
  ) {}

  /** To every destination that is on; with `only`, to that one, on or off, as a test does. */
  async send(message: Message, only?: string): Promise<SendOutcome> {
    const state = currentDestinations();
    let targets = state.entries.filter((entry) => entry.enabled && entry.problem === undefined);
    if (only !== undefined) {
      const target = state.entries.find((entry) => entry.key === only);
      if (!target) return { kind: 'not-ready', state: 'incomplete' };
      if (target.problem) return { kind: 'not-ready', state: 'invalid' };
      targets = [target];
    } else if (state.kind !== 'ready') {
      return { kind: 'not-ready', state: state.kind };
    }
    const delivery = await deliver(
      vscode.l10n.t,
      targets,
      message,
      (server) => Promise.resolve(this.secrets.get(tokenKey(server))),
      publish,
    );
    const entry = { time: Date.now(), title: message.title, message: message.message };
    const text = deliveryError(delivery);
    if (text === undefined) {
      await this.history.add(entry);
      return { kind: 'sent', count: delivery.sent.length };
    }
    const partial = delivery.sent.length > 0;
    await this.history.add({ ...entry, error: text, ...(partial ? { partial } : {}) });
    return { kind: 'failed', failures: delivery.failures, sent: delivery.sent.length, text };
  }
}
