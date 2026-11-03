// When to notify and what to say, read from and written to the `nightping.*` settings.
// Pure: takes a getter, so tests need no VS Code.
import {
  CONTENT_LEVELS,
  SOURCE_KINDS,
  type ContentLevel,
  type NotifyPrefs,
  type SourceKind,
} from '../shared/protocol';

/** Setting names under `nightping.`. */
export const SOURCE_SETTINGS: Record<SourceKind, string> = {
  task: 'notifyOn.tasks',
  terminal: 'notifyOn.terminalCommands',
  notebook: 'notifyOn.notebookCells',
  debug: 'notifyOn.debugSessions',
  claude: 'notifyOn.claudeCode',
};
export const MINIMUM_SETTING = 'minimumDuration';
export const AWAY_SETTING = 'onlyWhenAway';
export const CONTENT_SETTING = 'content';

/** One day: longer than anything anyone waits for at the desk. */
export const MAX_MINIMUM_SECONDS = 86_400;

export const DEFAULT_PREFS: NotifyPrefs = {
  sources: { task: true, terminal: true, notebook: true, debug: true, claude: true },
  minimumSeconds: 30,
  onlyWhenAway: true,
  content: 'result',
};

export function readPrefs(get: (key: string) => unknown): NotifyPrefs {
  const flag = (key: string, fallback: boolean) => {
    const value = get(key);
    return typeof value === 'boolean' ? value : fallback;
  };
  const sources = Object.fromEntries(
    SOURCE_KINDS.map((kind) => [kind, flag(SOURCE_SETTINGS[kind], DEFAULT_PREFS.sources[kind])]),
  ) as Record<SourceKind, boolean>;
  const minimum = get(MINIMUM_SETTING);
  const content = get(CONTENT_SETTING);
  return {
    sources,
    minimumSeconds: isMinimum(minimum) ? minimum : DEFAULT_PREFS.minimumSeconds,
    onlyWhenAway: flag(AWAY_SETTING, DEFAULT_PREFS.onlyWhenAway),
    content: isContentLevel(content) ? content : DEFAULT_PREFS.content,
  };
}

/** The setting a change from the panel writes, or `undefined` when the change is not valid. */
export function settingFor(
  change: unknown,
): { key: string; value: boolean | number | string } | undefined {
  if (typeof change !== 'object' || change === null) return undefined;
  const c = change as Record<string, unknown>;
  switch (c.key) {
    case 'source':
      return SOURCE_KINDS.includes(c.source as SourceKind) && typeof c.on === 'boolean'
        ? { key: SOURCE_SETTINGS[c.source as SourceKind], value: c.on }
        : undefined;
    case 'minimumSeconds':
      return isMinimum(c.seconds) ? { key: MINIMUM_SETTING, value: c.seconds } : undefined;
    case 'onlyWhenAway':
      return typeof c.on === 'boolean' ? { key: AWAY_SETTING, value: c.on } : undefined;
    case 'content':
      return isContentLevel(c.content) ? { key: CONTENT_SETTING, value: c.content } : undefined;
    default:
      return undefined;
  }
}

function isMinimum(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_MINIMUM_SECONDS
  );
}

function isContentLevel(value: unknown): value is ContentLevel {
  return CONTENT_LEVELS.includes(value as ContentLevel);
}
