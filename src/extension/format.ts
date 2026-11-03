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
  warning: '⚠️',
  question: '❓',
};

/** The first sentence of an agent's reply fits on a phone under the result line. */
export const SUMMARY_LIMIT = 140;

export function formatEvent(
  t: Translate,
  event: FinishedEvent,
  level: ContentLevel,
  workspace: string | undefined,
): Message {
  // An agent says where it works; VS Code's own runs are in this window's workspace.
  const place = event.kind === 'claude' ? (event.folder ?? workspace) : workspace;
  const where = level !== 'result' && place ? place.trim() : '';
  const title = [what(t, event, level), where].filter((part) => part !== '').join(SEPARATOR);
  const duration = event.durationMs === undefined ? '' : formatDuration(t, event.durationMs);
  const line = [result(t, event), duration].filter((part) => part !== '').join(SEPARATOR);
  const detail = level === 'details' ? agentDetail(event) : '';
  return { title, message: detail ? `${line}\n${detail}` : line, ...look(event) };
}

function look(event: FinishedEvent): Pick<Message, 'tags' | 'priority'> {
  switch (outcomeOf(event).kind) {
    case 'failed':
      return { tags: ['x'], priority: 4 };
    case 'needs-you':
      return event.kind === 'claude' && event.state === 'question'
        ? { tags: ['question'], priority: 4 }
        : { tags: ['warning'], priority: 4 };
    case 'succeeded':
      return { tags: ['white_check_mark'] };
    case 'finished':
      // An agent's turn ends as planned; VS Code does not say how other runs ended.
      return { tags: [event.kind === 'claude' ? 'white_check_mark' : 'checkered_flag'] };
  }
}

/** The first sentence of the reply, or what the agent waits for; nothing for a question. */
function agentDetail(event: FinishedEvent): string {
  if (event.kind !== 'claude') return '';
  if (event.state === 'finished') return firstSentence(event.reply ?? '');
  return event.state === 'approval' ? cut(oneLine(event.detail ?? ''), SUMMARY_LIMIT) : '';
}

/** The first sentence of the first line with text, without Markdown. */
export function firstSentence(reply: string): string {
  for (const raw of reply.split(/\r?\n/)) {
    const line = raw
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\*\*|__|`/g, '')
      .replace(/^[#>*|\s-]+/, '')
      .trim();
    if (line) return cut(line.split(/(?<=[.!?])\s/, 1)[0], SUMMARY_LIMIT);
  }
  return '';
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
  if (event.kind === 'claude') return t('Claude Code');
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
    case 'needs-you':
      return event.kind === 'claude' && event.state === 'question'
        ? t('Has a question for you')
        : t('Needs your approval');
  }
}

/** One line, at most `DETAIL_LIMIT` characters. */
function shorten(text: string): string {
  return cut(oneLine(text), DETAIL_LIMIT);
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function cut(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}
