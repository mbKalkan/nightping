// Nightping's own hooks in Codex's hooks.json. Codex runs command hooks only (no HTTP), in the
// session's shell, with the event's JSON on stdin; curl forwards it to the endpoint.
import { AGENT_PATHS } from '../endpoint';
import type { HookSpec } from '../hookFile';

/** A prompt starts the turn, Stop ends it, PermissionRequest says Codex waits for approval. */
export const CODEX_EVENTS = ['UserPromptSubmit', 'Stop', 'PermissionRequest'] as const;

/** Seconds; curl gives up after 5, so this only bounds a stuck curl. */
export const CODEX_TIMEOUT = 10;

const OUR_URL = /http:\/\/127\.0\.0\.1:(\d+)\/nightping\/codex(?=\s|$)/;

/**
 * The command for each platform. The JSON goes as is from stdin (`"@-"`, quoted for PowerShell).
 * On Windows the shell is PowerShell, where `curl` means something else, so the command names
 * Windows' own curl.exe by its full path.
 */
export function codexCommands(port: number, windowsCurl: string) {
  const args = `-s -m 5 -H "Content-Type: application/json" --data-binary "@-" http://127.0.0.1:${port}${AGENT_PATHS.codex}`;
  return { command: `curl ${args}`, commandWindows: `${windowsCurl} ${args}` };
}

/** `windowsCurl` is curl.exe in this computer's Windows folder. */
export function codexHooks(windowsCurl: string): HookSpec {
  return {
    events: CODEX_EVENTS,
    entry: (port) => ({
      hooks: [
        {
          type: 'command',
          ...codexCommands(port, windowsCurl),
          timeout: CODEX_TIMEOUT,
          // Codex does not wait for it, and nothing it prints can change what Codex does.
          async: true,
        },
      ],
    }),
    portOf(hook) {
      if (typeof hook !== 'object' || hook === null) return undefined;
      const { type, command, commandWindows } = hook as Record<string, unknown>;
      if (type !== 'command') return undefined;
      for (const text of [command, commandWindows]) {
        const match = typeof text === 'string' ? OUR_URL.exec(text) : null;
        if (match) return Number(match[1]);
      }
      return undefined;
    },
  };
}
