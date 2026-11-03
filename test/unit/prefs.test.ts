import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, readPrefs, settingFor, SOURCE_SETTINGS } from '../../src/extension/prefs';

const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
  contributes: { configuration: { properties: Record<string, { default: unknown }> } };
};
const settings = manifest.contributes.configuration.properties;

describe('readPrefs', () => {
  it('uses the defaults the manifest declares', () => {
    const fromManifest = readPrefs((key) => settings[`nightping.${key}`]?.default);
    expect(fromManifest).toEqual(DEFAULT_PREFS);
    for (const key of Object.values(SOURCE_SETTINGS)) {
      expect(settings[`nightping.${key}`], key).toBeDefined();
    }
  });

  it('reads what the user set', () => {
    const values: Record<string, unknown> = {
      'notifyOn.terminalCommands': false,
      minimumDuration: 120,
      onlyWhenAway: false,
      content: 'details',
    };
    expect(readPrefs((key) => values[key])).toEqual({
      sources: { task: true, terminal: false, notebook: true, debug: true },
      minimumSeconds: 120,
      onlyWhenAway: false,
      content: 'details',
    });
  });

  it('falls back to the default for a value of the wrong kind', () => {
    const values: Record<string, unknown> = {
      'notifyOn.tasks': 'yes',
      minimumDuration: -5,
      content: 'everything',
    };
    expect(readPrefs((key) => values[key])).toEqual(DEFAULT_PREFS);
  });
});

describe('settingFor', () => {
  it('turns a change from the panel into the setting it writes', () => {
    expect(settingFor({ key: 'source', source: 'notebook', on: false })).toEqual({
      key: 'notifyOn.notebookCells',
      value: false,
    });
    expect(settingFor({ key: 'minimumSeconds', seconds: 300 })).toEqual({
      key: 'minimumDuration',
      value: 300,
    });
    expect(settingFor({ key: 'onlyWhenAway', on: true })).toEqual({
      key: 'onlyWhenAway',
      value: true,
    });
    expect(settingFor({ key: 'content', content: 'folder' })).toEqual({
      key: 'content',
      value: 'folder',
    });
  });

  it('refuses anything else', () => {
    for (const change of [
      undefined,
      null,
      'source',
      { key: 'server', value: 'https://evil.example' },
      { key: 'source', source: 'everything', on: true },
      { key: 'source', source: 'task', on: 'true' },
      { key: 'minimumSeconds', seconds: Number.NaN },
      { key: 'minimumSeconds', seconds: 1e9 },
      { key: 'content', content: 'all' },
    ]) {
      expect(settingFor(change), JSON.stringify(change)).toBeUndefined();
    }
  });
});
