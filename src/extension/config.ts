// Reads where notifications go. Pure: takes a getter so tests need no VS Code.
import { isServerUrl, isTopic, normalizeServer } from '../shared/destination';

export {
  isServerUrl,
  isToken,
  isTopic,
  normalizeServer,
  suggestTopic,
} from '../shared/destination';

export interface Destination {
  /** Server URL without a trailing slash, e.g. `https://ntfy.sh`. */
  server: string;
  topic: string;
}

export type DestinationState =
  | { kind: 'ready'; destination: Destination }
  | { kind: 'incomplete' }
  | { kind: 'invalid'; setting: 'server' | 'topic' };

export function readDestination(get: (key: 'server' | 'topic') => unknown): DestinationState {
  const server = normalizeServer(text(get('server')));
  const topic = text(get('topic'));
  if (!server || !topic) {
    return { kind: 'incomplete' };
  }
  if (!isServerUrl(server)) {
    return { kind: 'invalid', setting: 'server' };
  }
  if (!isTopic(topic)) {
    return { kind: 'invalid', setting: 'topic' };
  }
  return { kind: 'ready', destination: { server, topic } };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
