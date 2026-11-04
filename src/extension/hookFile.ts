// Nightping's own hooks in an agent's JSON hooks file (Claude Code's settings, Codex's
// hooks.json, Copilot's hooks folder): added on Connect, removed on Disconnect, and nothing else
// in the file touched. Pure: works on the file's text. Each event lists groups of hooks (Claude
// Code, Codex) or the hooks themselves (Copilot).

/** What Nightping's hooks look like in one agent's file. */
export interface HookSpec {
  events: readonly string[];
  /** What Nightping adds to each event: a group holding its hook, or the hook itself. */
  entry(port: number): Record<string, unknown>;
  /** Other top-level fields the file needs, kept when the file already has them. */
  header?: Record<string, unknown>;
  /** The port of a hook that is Nightping's, or `undefined` for anyone else's. */
  portOf(hook: unknown): number | undefined;
}

export type HooksState =
  /** Every event has Nightping's hook at this port. */
  | 'connected'
  /** Some Nightping hooks are there, but not all, or for another port. */
  | 'outdated'
  | 'disconnected'
  /** The file is not a JSON object, so Nightping leaves it alone. */
  | 'invalid';

export class InvalidSettings extends Error {}

/** The hooks to add, as a file fragment: what Copy Settings puts on the clipboard. */
export function hookSettings(spec: HookSpec, port: number): Record<string, unknown> {
  const hooks: Record<string, unknown[]> = {};
  for (const event of spec.events) hooks[event] = [spec.entry(port)];
  return { ...spec.header, hooks };
}

export function hooksState(spec: HookSpec, text: string | undefined, port: number): HooksState {
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
      const port = spec.portOf(hook);
      if (port === undefined) continue;
      if (!ports.has(event)) ports.set(event, new Set());
      ports.get(event)?.add(port);
    }
  }
  if (ports.size === 0) return 'disconnected';
  const exact =
    ports.size === spec.events.length &&
    spec.events.every((event) => {
      const found = ports.get(event);
      return found?.size === 1 && found.has(port);
    });
  return exact ? 'connected' : 'outdated';
}

/** The file with Nightping's hooks for `port`, and any older ones removed. */
export function connectedText(spec: HookSpec, text: string | undefined, port: number): string {
  const settings = { ...spec.header, ...withoutOurs(spec, parse(text)) };
  const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
  for (const event of spec.events) {
    hooks[event] = [...(Array.isArray(hooks[event]) ? hooks[event] : []), spec.entry(port)];
  }
  settings.hooks = hooks;
  return format(settings, text);
}

/** The file without Nightping's hooks. */
export function disconnectedText(spec: HookSpec, text: string | undefined): string {
  return format(withoutOurs(spec, parse(text)), text);
}

/** The hooks under an event: those in its groups, and those listed directly. */
function hooksIn(entries: unknown): unknown[] {
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry) =>
    typeof entry === 'object' &&
    entry !== null &&
    Array.isArray((entry as { hooks?: unknown }).hooks)
      ? (entry as { hooks: unknown[] }).hooks
      : [entry],
  );
}

/** Removes Nightping's hooks, and the groups, events and `hooks` they leave empty. */
function withoutOurs(spec: HookSpec, settings: Record<string, unknown>): Record<string, unknown> {
  const hooks = settings.hooks as Record<string, unknown> | undefined;
  if (!hooks) return settings;
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    let changed = false;
    const kept = groups.flatMap((group) => {
      if (typeof group !== 'object' || group === null) return [group];
      const entries = (group as { hooks?: unknown }).hooks;
      if (!Array.isArray(entries)) {
        // A hook listed directly under the event.
        if (spec.portOf(group) === undefined) return [group];
        changed = true;
        return [];
      }
      const others = entries.filter((hook) => spec.portOf(hook) === undefined);
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
