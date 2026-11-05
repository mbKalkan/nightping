// Reads where notifications go. Pure: takes the setting's value, so tests need no VS Code.
import {
  destinationKey,
  isServerUrl,
  isTopic,
  normalizeServer,
  type Destination,
} from '../shared/destination';

export {
  destinationKey,
  displayName,
  isName,
  isServerUrl,
  isToken,
  isTopic,
  normalizeServer,
  suggestTopic,
  type Destination,
} from '../shared/destination';

export interface DestinationEntry extends Destination {
  key: string;
  /** The value that is wrong; such a destination is listed, but nothing is sent to it. */
  problem?: 'server' | 'topic';
}

/**
 * - `ready`: at least one destination is on and valid; notifications go to every such one.
 * - `incomplete`: there is no destination yet.
 * - `off`: every destination is turned off.
 * - `invalid`: the ones that are on all have a wrong server or topic.
 */
export type DestinationsKind = 'ready' | 'incomplete' | 'off' | 'invalid';

export interface DestinationsState {
  kind: DestinationsKind;
  /** In the order of the setting; the same server and topic twice is listed once. */
  entries: DestinationEntry[];
}

/** Reads `nightping.destinations`; anything that is not a destination is left out. */
export function readDestinations(value: unknown): DestinationsState {
  const entries: DestinationEntry[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(value) ? value : []) {
    if (typeof item !== 'object' || item === null) continue;
    const raw = item as Record<string, unknown>;
    const server = normalizeServer(text(raw.server));
    const topic = text(raw.topic);
    const key = destinationKey({ server, topic });
    if (seen.has(key)) continue;
    seen.add(key);
    const entry: DestinationEntry = {
      key,
      name: text(raw.name),
      server,
      topic,
      enabled: raw.enabled !== false,
    };
    if (!isServerUrl(server)) entry.problem = 'server';
    else if (!isTopic(topic)) entry.problem = 'topic';
    entries.push(entry);
  }
  return { kind: kindOf(entries), entries };
}

function kindOf(entries: DestinationEntry[]): DestinationsKind {
  if (entries.length === 0) return 'incomplete';
  const on = entries.filter((entry) => entry.enabled);
  if (on.length === 0) return 'off';
  return on.some((entry) => entry.problem === undefined) ? 'ready' : 'invalid';
}

/** What the setting stores for a destination: no name when it has none, `enabled` only when off. */
export function storedForm(destination: Destination): Record<string, unknown> {
  return {
    ...(destination.name.trim() !== '' ? { name: destination.name.trim() } : {}),
    server: normalizeServer(destination.server),
    topic: destination.topic.trim(),
    ...(destination.enabled ? {} : { enabled: false }),
  };
}

/**
 * Before 0.2.0 there was one server and one topic. While no destination has been saved, they
 * become the first one.
 */
export function legacyDestinations(
  server: unknown,
  topic: unknown,
  destinations: unknown,
): Record<string, unknown>[] | undefined {
  if (destinations !== undefined) return undefined;
  const legacy = { name: '', server: text(server), topic: text(topic), enabled: true };
  if (legacy.server === '' || legacy.topic === '') return undefined;
  return [storedForm(legacy)];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
