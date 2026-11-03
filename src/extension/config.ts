// Reads where notifications go. Pure: takes a getter so tests need no VS Code.

export interface Destination {
  /** Server URL without a trailing slash, e.g. `https://ntfy.sh`. */
  server: string;
  topic: string;
}

export type DestinationState =
  | { kind: 'ready'; destination: Destination }
  | { kind: 'incomplete' }
  | { kind: 'invalid'; setting: 'server' | 'topic' };

// ntfy's own rule for topic names.
const TOPIC = /^[-_A-Za-z0-9]{1,64}$/;

export function readDestination(get: (key: 'server' | 'topic') => unknown): DestinationState {
  const server = text(get('server')).replace(/\/+$/, '');
  const topic = text(get('topic'));
  if (!server || !topic) {
    return { kind: 'incomplete' };
  }
  if (!isServerUrl(server)) {
    return { kind: 'invalid', setting: 'server' };
  }
  if (!TOPIC.test(topic)) {
    return { kind: 'invalid', setting: 'topic' };
  }
  return { kind: 'ready', destination: { server, topic } };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isServerUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    (url.protocol === 'https:' || url.protocol === 'http:') &&
    url.hostname !== '' &&
    url.username === '' &&
    url.password === '' &&
    url.search === '' &&
    url.hash === ''
  );
}
