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
  // A port of its own, so that a Nightping in the developer's VS Code does not answer.
  JSON.stringify({
    'update.mode': 'none',
    'extensions.autoUpdate': false,
    'nightping.port': 47388,
  }),
);
// An empty folder to open: tasks run in a workspace folder.
const folder = mkdtempSync(join(tmpdir(), 'nightping-smoke-folder-'));
// Claude Code's settings for the test, away from the developer's own ~/.claude.
const claudeDir = mkdtempSync(join(tmpdir(), 'nightping-smoke-claude-'));
// And Codex's, away from the developer's own ~/.codex.
const codexDir = mkdtempSync(join(tmpdir(), 'nightping-smoke-codex-'));
// And a home folder for Copilot's hooks folder, which is always under it.
const homeDir = mkdtempSync(join(tmpdir(), 'nightping-smoke-home-'));
try {
  await runTests({
    version: process.env.VSCODE_VERSION ?? 'stable',
    extensionDevelopmentPath: root,
    extensionTestsPath: suite,
    extensionTestsEnv: {
      CLAUDE_CONFIG_DIR: claudeDir,
      CODEX_HOME: codexDir,
      HOME: homeDir,
      USERPROFILE: homeDir,
    },
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
  for (const dir of [userData, folder, claudeDir, codexDir, homeDir]) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
}
