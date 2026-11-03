// Runs inside a real VS Code instance (see scripts/smoke.mjs).
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

const EXTENSION_ID = 'MBKDevStudio.nightping';

async function waitFor<T>(probe: () => T | undefined, timeoutMs = 30_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = probe();
    if (value !== undefined) {
      return value;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for condition.');
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

const tests: Record<string, () => Promise<void>> = {
  async 'starts with VS Code, to listen for events in the background'() {
    await waitFor(() =>
      vscode.extensions.getExtension(EXTENSION_ID)?.isActive ? true : undefined,
    );
  },

  async 'contributes its commands'() {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('nightping.openSettings'));
  },

  async 'opens its settings from the command palette'() {
    await vscode.commands.executeCommand('nightping.openSettings');
  },

  async 'starts without a server or topic'() {
    const settings = vscode.workspace.getConfiguration('nightping');
    assert.equal(settings.get('server'), '');
    assert.equal(settings.get('topic'), '');
  },
};

export async function run(): Promise<void> {
  const failures: string[] = [];
  for (const [name, test] of Object.entries(tests)) {
    try {
      await test();
      console.log(`  ✓ ${name}`);
    } catch (error) {
      console.log(`  ✗ ${name}`);
      failures.push(`${name}: ${error instanceof Error ? error.stack : String(error)}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`${failures.length} smoke test(s) failed:\n${failures.join('\n')}`);
  }
}
