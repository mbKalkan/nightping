import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readJson = (path: string) =>
  JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;

const manifest = readJson('package.json') as {
  icon: string;
  files: string[];
  engines: { vscode: string };
  extensionKind: string[];
  contributes: {
    commands: { command: string }[];
    configuration: { properties: Record<string, { scope?: string; default?: unknown }> };
  };
  keywords: string[];
  devDependencies: Record<string, string>;
  dependencies?: Record<string, string>;
};

describe('extension manifest', () => {
  it('ships a PNG icon of at least 128 px, as the Marketplace asks', () => {
    expect(manifest.files).toContain(manifest.icon);
    const png = readFileSync(manifest.icon);
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
    // The IHDR chunk holds the width and height right after the signature.
    expect(png.readUInt32BE(16)).toBeGreaterThanOrEqual(128);
    expect(png.readUInt32BE(20)).toBe(png.readUInt32BE(16));
  });

  it('targets the same VS Code API version as @types/vscode', () => {
    const engine = manifest.engines.vscode.replace(/^\^/, '');
    const types = manifest.devDependencies['@types/vscode'].replace(/^[\^~]/, '');
    expect(types).toBe(engine);
  });

  it('runs on the local machine, so notifications leave from there', () => {
    expect(manifest.extensionKind).toEqual(['ui']);
  });

  it('has no runtime dependencies', () => {
    expect(manifest.dependencies ?? {}).toEqual({});
  });

  it('ships no default destination', () => {
    const { properties } = manifest.contributes.configuration;
    expect(properties['nightping.destinations'].default).toEqual([]);
    expect(properties['nightping.server'].default).toBe('');
    expect(properties['nightping.topic'].default).toBe('');
  });

  it('keeps every setting out of workspace settings, so a repository cannot redirect notifications', () => {
    for (const [key, setting] of Object.entries(manifest.contributes.configuration.properties)) {
      expect(setting.scope, key).toBe('application');
    }
  });

  it('registers every command it contributes', () => {
    const source = readFileSync('src/extension/extension.ts', 'utf8');
    for (const { command } of manifest.contributes.commands) {
      expect(source, command).toContain(`'${command}'`);
    }
  });

  it('stays within the Marketplace limit of 30 keywords', () => {
    expect(manifest.keywords.length).toBeLessThanOrEqual(30);
    expect(new Set(manifest.keywords).size).toBe(manifest.keywords.length);
  });

  it('defines every %placeholder% in each package.nls file', () => {
    const placeholders = [...JSON.stringify(manifest).matchAll(/"%([^%"]+)%"/g)].map((m) => m[1]);
    expect(placeholders.length).toBeGreaterThan(0);
    for (const file of ['package.nls.json', 'package.nls.tr.json']) {
      const nls = readJson(file);
      for (const key of placeholders) {
        expect(nls, `${file} is missing "${key}"`).toHaveProperty([key]);
      }
    }
  });

  it('keeps the English and Turkish manifest strings in sync', () => {
    const en = Object.keys(readJson('package.nls.json')).sort();
    const tr = Object.keys(readJson('package.nls.tr.json')).sort();
    expect(tr).toEqual(en);
  });
});
