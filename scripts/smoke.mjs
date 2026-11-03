// Builds the smoke test suite and runs it inside a downloaded copy of VS Code.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runTests } from '@vscode/test-electron';
import * as esbuild from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const suite = resolve(root, 'out/smoke/suite.js');

await esbuild.build({
  entryPoints: [resolve(root, 'test/smoke/suite.ts')],
  outfile: suite,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  logLevel: 'warning',
});

// When launched from a terminal inside VS Code this is set and would make Code.exe behave as Node.
delete process.env.ELECTRON_RUN_AS_NODE;

// A fresh profile each run, with updates off so the test copy never starts an update.
const userData = mkdtempSync(join(tmpdir(), 'nightping-smoke-'));
mkdirSync(join(userData, 'User'));
writeFileSync(
  join(userData, 'User', 'settings.json'),
  JSON.stringify({ 'update.mode': 'none', 'extensions.autoUpdate': false }),
);
// An empty folder to open: tasks run in a workspace folder.
const folder = mkdtempSync(join(tmpdir(), 'nightping-smoke-folder-'));
try {
  await runTests({
    version: process.env.VSCODE_VERSION ?? 'stable',
    extensionDevelopmentPath: root,
    extensionTestsPath: suite,
    launchArgs: [
      folder,
      '--disable-extensions',
      '--skip-welcome',
      '--disable-workspace-trust',
      '--user-data-dir',
      userData,
    ],
  });
} finally {
  for (const dir of [userData, folder]) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
}
