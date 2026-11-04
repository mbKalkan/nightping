import { describe, expect, it } from 'vitest';
import { DEFAULT_TITLE, readMessage, TAG_LIMIT, TITLE_LIMIT } from '../../src/extension/message';
import type { Translate } from '../../src/extension/texts';
import { MESSAGE_LIMIT } from '../../src/shared/protocol';

const english: Translate = (message, ...args) =>
  message.replace(/\{(\d+)\}/g, (_, index: string) => String(args[Number(index)]));

const read = (input: unknown) => readMessage(english, input);

describe('readMessage', () => {
  it('takes the text alone, under a title the phone can show', () => {
    expect(read('  Build is done  ')).toEqual({
      ok: true,
      message: { title: DEFAULT_TITLE, message: 'Build is done' },
    });
  });

  it('takes a title, a priority and ntfy tags', () => {
    expect(
      read({ title: 'Deploy', message: 'Staging is up', priority: 4, tags: ['rocket', '+1'] }),
    ).toEqual({
      ok: true,
      message: { title: 'Deploy', message: 'Staging is up', priority: 4, tags: ['rocket', '+1'] },
    });
  });

  it('ignores keys it does not know, so newer callers still work', () => {
    expect(read({ message: 'Hi', click: 'https://example.com' })).toEqual({
      ok: true,
      message: { title: DEFAULT_TITLE, message: 'Hi' },
    });
  });

  it('keeps the lines of a message but puts the title on one line', () => {
    const result = read({ title: ' Two\n lines ', message: 'first\nsecond' });
    expect(result).toEqual({ ok: true, message: { title: 'Two lines', message: 'first\nsecond' } });
  });

  it('uses the default title for an empty one, and drops an empty tag list', () => {
    expect(read({ title: '   ', message: 'Hi', tags: [] })).toEqual({
      ok: true,
      message: { title: DEFAULT_TITLE, message: 'Hi' },
    });
  });

  it('cuts a long title and a long message', () => {
    const result = read({ title: 'T'.repeat(500), message: 'm'.repeat(5000) });
    if (!result.ok) throw new Error(result.problem);
    expect(result.message.title).toHaveLength(TITLE_LIMIT);
    expect(result.message.title.endsWith('…')).toBe(true);
    expect(result.message.message).toHaveLength(MESSAGE_LIMIT);
    expect(result.message.message.endsWith('…')).toBe(true);
  });

  it('says what is wrong with what it cannot send', () => {
    const problem = (input: unknown) => {
      const result = read(input);
      return result.ok ? undefined : result.problem;
    };
    expect(problem(undefined)).toMatch(/as text, or as an object/);
    expect(problem(null)).toMatch(/as text, or as an object/);
    expect(problem(42)).toMatch(/as text, or as an object/);
    expect(problem(['Hi'])).toMatch(/as text, or as an object/);
    expect(problem('   ')).toBe('"message" must be text that is not empty.');
    expect(problem({ text: 'Hi' })).toBe('"message" must be text that is not empty.');
    expect(problem({ message: 'Hi', title: 7 })).toBe('"title" must be text.');
    for (const priority of [0, 6, 2.5, '4']) {
      expect(problem({ message: 'Hi', priority })).toMatch(/^"priority"/);
    }
    const tooMany = Array.from({ length: TAG_LIMIT + 1 }, (_, i) => `tag${i}`);
    for (const tags of ['warning', [1], ['two words'], ['a,b'], [''], tooMany]) {
      expect(problem({ message: 'Hi', tags })).toMatch(/^"tags"/);
    }
  });
});
