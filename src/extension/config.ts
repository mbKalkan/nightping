// Reads where notifications go. Pure: takes a getter so tests need no VS Code.
import { randomInt } from 'node:crypto';

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

/** Trims spaces and trailing slashes, the form the setting is stored and used in. */
export function normalizeServer(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export function isServerUrl(value: string): boolean {
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

export function isTopic(value: string): boolean {
  return TOPIC.test(value);
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * A random topic name to offer during setup. On a public server the topic works like a
 * password, so the suggestion is long enough (about 103 bits) that nobody can guess it.
 */
export function suggestTopic(): string {
  let suffix = '';
  for (let i = 0; i < 20; i++) {
    suffix += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `nightping-${suffix}`;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
