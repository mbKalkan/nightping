// Reads and writes the destinations in the user settings, and their tokens in SecretStorage.
import * as vscode from 'vscode';
import {
  destinationKey,
  legacyDestinations,
  normalizeServer,
  readDestinations,
  storedForm,
  type DestinationEntry,
  type DestinationsState,
} from './config';

/** Where 0.1.0 kept its one token. */
const LEGACY_TOKEN_KEY = 'accessToken';
const TOKEN_PREFIX = 'token:';

/** A token belongs to a server, as ntfy's tokens do; every topic on it uses the same one. */
export function tokenKey(server: string): string {
  return `${TOKEN_PREFIX}${normalizeServer(server)}`;
}

export function isTokenKey(key: string): boolean {
  return key.startsWith(TOKEN_PREFIX);
}

export function currentDestinations(): DestinationsState {
  return readDestinations(settings().get('destinations'));
}

export interface DestinationInput {
  name: string;
  server: string;
  topic: string;
  /** Empty keeps the token saved for the server, if any. */
  token: string;
}

export type SaveResult = { ok: true; key: string } | { ok: false; reason: 'duplicate' };

/**
 * Adds a destination, or with `previous` replaces that one in its place and keeps it on or off.
 * The same server and topic twice is refused: every notification would come twice.
 */
export async function saveDestination(
  secrets: vscode.SecretStorage,
  input: DestinationInput,
  previous?: string,
): Promise<SaveResult> {
  const { entries } = currentDestinations();
  const key = destinationKey(input);
  if (entries.some((entry) => entry.key === key && entry.key !== previous)) {
    return { ok: false, reason: 'duplicate' };
  }
  const at = previous === undefined ? -1 : entries.findIndex((entry) => entry.key === previous);
  const old = at >= 0 ? entries[at] : undefined;
  const next = {
    name: input.name,
    server: normalizeServer(input.server),
    topic: input.topic.trim(),
    enabled: old?.enabled ?? true,
  };
  const list: Array<Omit<DestinationEntry, 'key'>> = [...entries];
  if (old) list[at] = next;
  else list.push(next);
  // Before the settings, so whoever reacts to the new settings finds the token.
  if (input.token.trim() !== '') await secrets.store(tokenKey(next.server), input.token.trim());
  await write(list);
  if (old && old.server !== next.server) await forgetToken(secrets, old.server, list);
  return { ok: true, key };
}

export async function removeDestination(secrets: vscode.SecretStorage, key: string): Promise<void> {
  const { entries } = currentDestinations();
  const gone = entries.find((entry) => entry.key === key);
  if (!gone) return;
  const list = entries.filter((entry) => entry !== gone);
  await write(list);
  await forgetToken(secrets, gone.server, list);
}

export async function setEnabled(key: string, enabled: boolean): Promise<void> {
  const { entries } = currentDestinations();
  if (!entries.some((entry) => entry.key === key)) return;
  await write(entries.map((entry) => (entry.key === key ? { ...entry, enabled } : entry)));
}

/** Turns the server and topic of 0.1.0 into the first destination, and moves its token. */
export async function migrateLegacy(secrets: vscode.SecretStorage): Promise<void> {
  const values = settings();
  const server = values.inspect('server')?.globalValue;
  const topic = values.inspect('topic')?.globalValue;
  if (server === undefined && topic === undefined) return;
  const list = legacyDestinations(server, topic, values.inspect('destinations')?.globalValue);
  if (list) {
    const token = await secrets.get(LEGACY_TOKEN_KEY);
    // Two windows may do this at once: both write the same, and the token is copied first.
    if (token !== undefined) await secrets.store(tokenKey(String(list[0].server)), token);
    await values.update('destinations', list, vscode.ConfigurationTarget.Global);
    await secrets.delete(LEGACY_TOKEN_KEY);
  }
  await values.update('server', undefined, vscode.ConfigurationTarget.Global);
  await values.update('topic', undefined, vscode.ConfigurationTarget.Global);
}

/** No destination uses the server any more, so its token goes too. */
async function forgetToken(
  secrets: vscode.SecretStorage,
  server: string,
  list: Array<{ server: string }>,
): Promise<void> {
  if (!list.some((entry) => entry.server === server)) await secrets.delete(tokenKey(server));
}

async function write(list: Array<Omit<DestinationEntry, 'key'>>): Promise<void> {
  await settings().update(
    'destinations',
    list.map((entry) => storedForm(entry)),
    vscode.ConfigurationTarget.Global,
  );
}

function settings(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('nightping');
}
