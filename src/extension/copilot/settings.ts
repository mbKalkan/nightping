// Nightping's hooks file in Copilot's hooks folder, which Copilot in VS Code (agent hooks) and
// Copilot CLI both read. Command hooks only: Copilot's HTTP hooks need https. The event's JSON
// comes on stdin and curl forwards it to the endpoint.
import { AGENT_PATHS } from '../endpoint';
import type { HookSpec } from '../hookFile';

/**
 * With these PascalCase names Copilot sends Claude Code's payload (snake_case fields and
 * `hook_event_name`). `notification` (approval) is Copilot CLI's own name, and VS Code skips it.
 */
export const COPILOT_EVENTS = ['UserPromptSubmit', 'Stop', 'notification'] as const;

/** Seconds; curl gives up after 5, so this only bounds a stuck curl. */
export const COPILOT_TIMEOUT = 10;

const OUR_URL = /http:\/\/127\.0\.0\.1:(\d+)\/nightping\/copilot(?=[\s;]|$)/;

/**
 * The command for each platform; on Windows Copilot runs it in PowerShell, where `curl` means
 * something else, so it names Windows' own curl.exe by its full path. Copilot waits for its
 * hooks: with VS Code closed, Windows takes two seconds to refuse a local connection, hence the
 * short connect timeout. The exit code stays 0, since VS Code's chat shows a warning for a
 * failed hook.
 */
export function copilotCommands(port: number, windowsCurl: string) {
  const args = `-s --connect-timeout 0.5 -m 5 -H "Content-Type: application/json" --data-binary "@-" http://127.0.0.1:${port}${AGENT_PATHS.copilot}`;
  return { bash: `curl ${args} || true`, powershell: `${windowsCurl} ${args}; exit 0` };
}

/** `windowsCurl` is curl.exe in this computer's Windows folder. */
export function copilotHooks(windowsCurl: string): HookSpec {
  return {
    events: COPILOT_EVENTS,
    entry: (port) => ({
      type: 'command',
      ...copilotCommands(port, windowsCurl),
      timeoutSec: COPILOT_TIMEOUT,
    }),
    header: { version: 1 },
    portOf(hook) {
      if (typeof hook !== 'object' || hook === null) return undefined;
      const { type, bash, powershell } = hook as Record<string, unknown>;
      if (type !== 'command') return undefined;
      for (const text of [bash, powershell]) {
        const match = typeof text === 'string' ? OUR_URL.exec(text) : null;
        if (match) return Number(match[1]);
      }
      return undefined;
    },
  };
}
