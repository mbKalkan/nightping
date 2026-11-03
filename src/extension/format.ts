// Turns a finished run into the notification the phone shows: the title says what and where,
// the message says how it ended and how long it took. Pure: `t` is VS Code's `l10n.t` or a stub.
import type { ContentLevel, NotificationPreview } from '../shared/protocol';
import { outcomeOf, type FinishedEvent } from './events';
import type { Message } from './ntfy';
import type { Translate } from './texts';

const SEPARATOR = ' · ';
/** Long command lines are cut so the phone still shows the result line. */
export const DETAIL_LIMIT = 80;

/** The emojis ntfy shows for the tags Nightping uses. */
const TAG_EMOJI: Record<string, string> = {
  x: '❌',
  white_check_mark: '✅',
  checkered_flag: '🏁',
  bell: '🔔',
};

export function formatEvent(
  t: Translate,
  event: FinishedEvent,
  level: ContentLevel,
  workspace: string | undefined,
): Message {
  const where = level !== 'result' && workspace ? workspace.trim() : '';
  const title = [what(t, event, level), where].filter((part) => part !== '').join(SEPARATOR);
  const message = [result(t, event), formatDuration(t, event.durationMs)].join(SEPARATOR);
  switch (outcomeOf(event).kind) {
    case 'failed':
      return { title, message, tags: ['x'], priority: 4 };
    case 'succeeded':
      return { title, message, tags: ['white_check_mark'] };
    case 'finished':
      return { title, message, tags: ['checkered_flag'] };
  }
}

export function previewOf(message: Message): NotificationPreview {
  const emoji = (message.tags ?? []).map((tag) => TAG_EMOJI[tag] ?? '').join('');
  return { emoji, title: message.title, message: message.message };
}

/** The panel's example: a `build` task that failed after 4 minutes, at each content level. */
export function samplePreviews(
  t: Translate,
  workspace: string | undefined,
): Record<ContentLevel, NotificationPreview> {
  const sample: FinishedEvent = { kind: 'task', name: 'build', exitCode: 1, durationMs: 252_000 };
  const at = (level: ContentLevel) =>
    previewOf(formatEvent(t, sample, level, workspace || 'my-project'));
  return { result: at('result'), folder: at('folder'), details: at('details') };
}

export function formatDuration(t: Translate, ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return minutes > 0 ? t('{0}h {1}m', hours, minutes) : t('{0}h', hours);
  if (minutes > 0) return seconds > 0 ? t('{0}m {1}s', minutes, seconds) : t('{0}m', minutes);
  return t('{0}s', seconds);
}

function what(t: Translate, event: FinishedEvent, level: ContentLevel): string {
  if (level === 'details') {
    switch (event.kind) {
      case 'task':
        return shorten(event.name) || t('Task');
      case 'terminal':
        return shorten(event.commandLine) || t('Terminal command');
      case 'notebook':
        return t('{0} · cell {1}', shorten(event.file), event.cell);
      case 'debug':
        return shorten(event.name) || t('Debug session');
    }
  }
  switch (event.kind) {
    case 'task':
      return t('Task');
    case 'terminal':
      return t('Terminal command');
    case 'notebook':
      return t('Notebook cell');
    case 'debug':
      return t('Debug session');
  }
}

function result(t: Translate, event: FinishedEvent): string {
  const outcome = outcomeOf(event);
  switch (outcome.kind) {
    case 'succeeded':
      return t('Succeeded');
    case 'failed':
      return outcome.exitCode === undefined
        ? t('Failed')
        : t('Failed (exit {0})', outcome.exitCode);
    case 'finished':
      return event.kind === 'debug' ? t('Ended') : t('Finished');
  }
}

/** One line, at most `DETAIL_LIMIT` characters. */
function shorten(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > DETAIL_LIMIT ? `${line.slice(0, DETAIL_LIMIT - 1).trimEnd()}…` : line;
}
