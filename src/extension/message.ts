// Reads a message of one's own: what a key binding or another extension passes to
// `nightping.send`, or what the user types. Pure: no VS Code. The input is not trusted.
import { MESSAGE_LIMIT } from '../shared/protocol';
import type { Message } from './ntfy';
import type { Translate } from './texts';

export const TITLE_LIMIT = 100;
export const TAG_LIMIT = 5;
/** Without a title, the phone would show the topic in its place. */
export const DEFAULT_TITLE = 'VS Code';

/** ntfy shows emoji short codes such as `warning` or `tada` as emojis; others as words. */
const TAG = /^[\p{L}\p{N}_+-]{1,40}$/u;

export type ReadMessage = { ok: true; message: Message } | { ok: false; problem: string };

/** Takes the text alone, or `{ message, title?, priority?, tags? }`; other keys are ignored. */
export function readMessage(t: Translate, input: unknown): ReadMessage {
  const fields = typeof input === 'string' ? { message: input } : input;
  if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) {
    return problem(t('Pass the message as text, or as an object with a "message".'));
  }
  const { message, title, priority, tags } = fields as Record<string, unknown>;
  if (typeof message !== 'string' || message.trim() === '') {
    return problem(t('"message" must be text that is not empty.'));
  }
  if (title !== undefined && typeof title !== 'string') {
    return problem(t('"title" must be text.'));
  }
  if (priority !== undefined && !isPriority(priority)) {
    return problem(t('"priority" must be a whole number from 1 to 5.'));
  }
  if (tags !== undefined && !isTags(tags)) {
    return problem(t('"tags" must be a list of up to 5 words, such as "warning" or "tada".'));
  }
  const heading = cut(title?.replace(/\s+/g, ' ').trim() ?? '', TITLE_LIMIT);
  return {
    ok: true,
    message: {
      title: heading || DEFAULT_TITLE,
      message: cut(message.trim(), MESSAGE_LIMIT),
      ...(priority === undefined ? {} : { priority }),
      ...(tags === undefined || tags.length === 0 ? {} : { tags }),
    },
  };
}

function problem(text: string): ReadMessage {
  return { ok: false, problem: text };
}

function isPriority(value: unknown): value is 1 | 2 | 3 | 4 | 5 {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 5;
}

function isTags(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= TAG_LIMIT &&
    value.every((tag) => typeof tag === 'string' && TAG.test(tag))
  );
}

function cut(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}
