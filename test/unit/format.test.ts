import { describe, expect, it } from 'vitest';
import type { FinishedEvent } from '../../src/extension/events';
import {
  DETAIL_LIMIT,
  formatDuration,
  formatEvent,
  previewOf,
  samplePreviews,
} from '../../src/extension/format';
import type { Translate } from '../../src/extension/texts';

const english: Translate = (message, ...args) =>
  message.replace(/\{(\d+)\}/g, (_, index: string) => String(args[Number(index)]));

const MINUTE = 60_000;
const build: FinishedEvent = {
  kind: 'task',
  name: 'build',
  exitCode: 1,
  durationMs: 4 * MINUTE + 12_000,
};

describe('formatDuration', () => {
  it('shows the two largest units, without zero parts', () => {
    expect(formatDuration(english, 0)).toBe('0s');
    expect(formatDuration(english, 12_999)).toBe('12s');
    expect(formatDuration(english, MINUTE)).toBe('1m');
    expect(formatDuration(english, 4 * MINUTE + 12_000)).toBe('4m 12s');
    expect(formatDuration(english, 60 * MINUTE)).toBe('1h');
    expect(formatDuration(english, 125 * MINUTE + 30_000)).toBe('2h 5m');
  });
});

describe('formatEvent', () => {
  it('says what finished, how it ended and how long it took', () => {
    expect(formatEvent(english, build, 'result', 'my-project')).toEqual({
      title: 'Task',
      message: 'Failed (exit 1) · 4m 12s',
      tags: ['x'],
      priority: 4,
    });
  });

  it('adds the workspace, then the details, as the content level allows', () => {
    expect(formatEvent(english, build, 'folder', 'my-project').title).toBe('Task · my-project');
    expect(formatEvent(english, build, 'details', 'my-project').title).toBe('build · my-project');
    expect(formatEvent(english, build, 'details', undefined).title).toBe('build');
  });

  it('marks success quietly and failure loudly', () => {
    const passed = formatEvent(english, { ...build, exitCode: 0 }, 'result', undefined);
    expect(passed).toEqual({
      title: 'Task',
      message: 'Succeeded · 4m 12s',
      tags: ['white_check_mark'],
    });
  });

  it('says "finished" when VS Code does not give a result', () => {
    const unknown = formatEvent(english, { ...build, exitCode: undefined }, 'result', undefined);
    expect(unknown.message).toBe('Finished · 4m 12s');
    expect(unknown.tags).toEqual(['checkered_flag']);
    expect(unknown.priority).toBeUndefined();
  });

  it('names each kind of run', () => {
    const command: FinishedEvent = {
      kind: 'terminal',
      commandLine: 'npm test',
      exitCode: 0,
      durationMs: 90_000,
    };
    const cell: FinishedEvent = {
      kind: 'notebook',
      file: 'train.ipynb',
      cell: 14,
      success: false,
      durationMs: 23 * MINUTE,
    };
    const debug: FinishedEvent = { kind: 'debug', name: 'Launch Program', durationMs: 5_000 };
    expect(formatEvent(english, command, 'result', undefined).title).toBe('Terminal command');
    expect(formatEvent(english, command, 'details', undefined).title).toBe('npm test');
    expect(formatEvent(english, cell, 'result', undefined)).toMatchObject({
      title: 'Notebook cell',
      message: 'Failed · 23m',
    });
    expect(formatEvent(english, cell, 'details', undefined).title).toBe('train.ipynb · cell 14');
    expect(formatEvent(english, debug, 'result', undefined)).toMatchObject({
      title: 'Debug session',
      message: 'Ended · 5s',
    });
    expect(formatEvent(english, debug, 'details', undefined).title).toBe('Launch Program');
  });

  it('keeps a long or multi-line command on one short line', () => {
    const commandLine = `echo one \\\n  && ${'x'.repeat(200)}`;
    const event: FinishedEvent = { kind: 'terminal', commandLine, exitCode: 2, durationMs: 1 };
    const { title } = formatEvent(english, event, 'details', undefined);
    expect(title.startsWith('echo one \\ && xxx')).toBe(true);
    expect(title).toHaveLength(DETAIL_LIMIT);
    expect(title.endsWith('…')).toBe(true);
  });

  it('falls back to the kind when a name is empty', () => {
    const event: FinishedEvent = {
      kind: 'terminal',
      commandLine: '  ',
      exitCode: 0,
      durationMs: 1,
    };
    expect(formatEvent(english, event, 'details', undefined).title).toBe('Terminal command');
  });
});

describe('previews', () => {
  it('shows the emoji ntfy puts before the title', () => {
    expect(previewOf(formatEvent(english, build, 'result', undefined))).toEqual({
      emoji: '❌',
      title: 'Task',
      message: 'Failed (exit 1) · 4m 12s',
    });
  });

  it('gives the panel one sample at each level', () => {
    const previews = samplePreviews(english, 'nightping');
    expect(previews.result.title).toBe('Task');
    expect(previews.folder.title).toBe('Task · nightping');
    expect(previews.details.title).toBe('build · nightping');
    expect(samplePreviews(english, undefined).folder.title).toBe('Task · my-project');
  });
});
