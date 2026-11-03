// Nightping's own hooks in Claude Code's user settings: added on Connect, removed on Disconnect,
// and nothing else in the file touched. Pure: works on the file's text.
import { HOOK_PATH } from './endpoint';

/** A prompt starts the turn, Stop ends it, Notification says Claude waits for the user. */
export const HOOK_EVENTS = ['UserPromptSubmit', 'Stop', 'Notification'] as const;

/** Seconds; the endpoint answers at once, so this only bounds a stuck VS Code. */
export const HOOK_TIMEOUT = 5;

const OUR_URL = /^http:\/\/(?:127\.0\.0\.1|localhost):(\d+)\/nightping\/claude-code$/;

export type HooksState =
  /** Every event has Nightping's hook at this port. */
  | 'connected'
  /** Some Nightping hooks are there, but not all, or for another port. */
  | 'outdated'
  | 'disconnected'
  /** The file is not a JSON object, so Nightping leaves it alone. */
  | 'invalid';

export class InvalidSettings extends Error {}

export function hookUrl(port: number): string {
  return `http://127.0.0.1:${port}${HOOK_PATH}`;
}

/** The hooks to add, as a settings fragment: what Copy Settings puts on the clipboard. */
export function hookSettings(port: number): { hooks: Record<string, unknown[]> } {
  const hooks: Record<string, unknown[]> = {};
  for (const event of HOOK_EVENTS) hooks[event] = [ourGroup(port)];
  return { hooks };
}

export function hooksState(text: string | undefined, port: number): HooksState {
  let settings: Record<string, unknown>;
  try {
    settings = parse(text);
  } catch {
    return 'invalid';
  }
  const hooks = settings.hooks as Record<string, unknown> | undefined;
  const ports = new Map<string, Set<number>>();
  for (const [event, groups] of Object.entries(hooks ?? {})) {
    for (const hook of hooksIn(groups)) {
      const port = ourPort(hook);
      if (port === undefined) continue;
      if (!ports.has(event)) ports.set(event, new Set());
      ports.get(event)?.add(port);
    }
  }
  if (ports.size === 0) return 'disconnected';
  const exact =
    ports.size === HOOK_EVENTS.length &&
    HOOK_EVENTS.every((event) => {
      const found = ports.get(event);
      return found?.size === 1 && found.has(port);
    });
  return exact ? 'connected' : 'outdated';
}

/** The file with Nightping's hooks for `port`, and any older ones removed. */
export function connectedText(text: string | undefined, port: number): string {
  const settings = withoutOurs(parse(text));
  const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
  for (const event of HOOK_EVENTS) {
    hooks[event] = [...(Array.isArray(hooks[event]) ? hooks[event] : []), ourGroup(port)];
  }
  settings.hooks = hooks;
  return format(settings, text);
}

/** The file without Nightping's hooks. */
export function disconnectedText(text: string | undefined): string {
  return format(withoutOurs(parse(text)), text);
}

function ourGroup(port: number) {
  return { hooks: [{ type: 'http', url: hookUrl(port), timeout: HOOK_TIMEOUT }] };
}

function ourPort(hook: unknown): number | undefined {
  if (typeof hook !== 'object' || hook === null) return undefined;
  const { type, url } = hook as Record<string, unknown>;
  if (type !== 'http' || typeof url !== 'string') return undefined;
  const match = OUR_URL.exec(url);
  return match ? Number(match[1]) : undefined;
}

function hooksIn(groups: unknown): unknown[] {
  if (!Array.isArray(groups)) return [];
  return groups.flatMap((group) =>
    typeof group === 'object' &&
    group !== null &&
    Array.isArray((group as { hooks?: unknown }).hooks)
      ? (group as { hooks: unknown[] }).hooks
      : [],
  );
}

/** Removes Nightping's hooks, and the groups, events and `hooks` they leave empty. */
function withoutOurs(settings: Record<string, unknown>): Record<string, unknown> {
  const hooks = settings.hooks as Record<string, unknown> | undefined;
  if (!hooks) return settings;
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    let changed = false;
    const kept = groups.flatMap((group) => {
      if (typeof group !== 'object' || group === null) return [group];
      const entries = (group as { hooks?: unknown }).hooks;
      if (!Array.isArray(entries)) return [group];
      const others = entries.filter((hook) => ourPort(hook) === undefined);
      if (others.length === entries.length) return [group];
      changed = true;
      return others.length === 0 ? [] : [{ ...group, hooks: others }];
    });
    if (!changed) continue;
    if (kept.length === 0) delete hooks[event];
    else hooks[event] = kept;
  }
  if (Object.keys(hooks).length === 0) delete settings.hooks;
  return settings;
}

function parse(text: string | undefined): Record<string, unknown> {
  if (text === undefined || text.trim() === '') return {};
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new InvalidSettings();
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InvalidSettings();
  }
  const hooks = (value as { hooks?: unknown }).hooks;
  if (
    hooks !== undefined &&
    (typeof hooks !== 'object' || hooks === null || Array.isArray(hooks))
  ) {
    throw new InvalidSettings();
  }
  return value as Record<string, unknown>;
}

/** JSON in the file's own indentation and line ends, ending with a line end. */
function format(settings: Record<string, unknown>, original: string | undefined): string {
  const indent = /^([ \t]+)\S/m.exec(original ?? '')?.[1] ?? '  ';
  const eol = original?.includes('\r\n') ? '\r\n' : '\n';
  return JSON.stringify(settings, null, indent).replace(/\n/g, eol) + eol;
}
