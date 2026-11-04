// Nightping's own hooks in Claude Code's user settings: HTTP hooks that post to the endpoint.
import { AGENT_PATHS } from '../endpoint';
import * as hookFile from '../hookFile';

export { InvalidSettings, type HooksState } from '../hookFile';

/** A prompt starts the turn, Stop ends it, Notification says Claude waits for the user. */
export const HOOK_EVENTS = ['UserPromptSubmit', 'Stop', 'Notification'] as const;

/** Seconds; the endpoint answers at once, so this only bounds a stuck VS Code. */
export const HOOK_TIMEOUT = 5;

const OUR_URL = /^http:\/\/(?:127\.0\.0\.1|localhost):(\d+)\/nightping\/claude-code$/;

export function hookUrl(port: number): string {
  return `http://127.0.0.1:${port}${AGENT_PATHS.claude}`;
}

export const CLAUDE_HOOKS: hookFile.HookSpec = {
  events: HOOK_EVENTS,
  group: (port) => ({ hooks: [{ type: 'http', url: hookUrl(port), timeout: HOOK_TIMEOUT }] }),
  portOf(hook) {
    if (typeof hook !== 'object' || hook === null) return undefined;
    const { type, url } = hook as Record<string, unknown>;
    if (type !== 'http' || typeof url !== 'string') return undefined;
    const match = OUR_URL.exec(url);
    return match ? Number(match[1]) : undefined;
  },
};

export const hookSettings = (port: number) => hookFile.hookSettings(CLAUDE_HOOKS, port);
export const hooksState = (text: string | undefined, port: number) =>
  hookFile.hooksState(CLAUDE_HOOKS, text, port);
export const connectedText = (text: string | undefined, port: number) =>
  hookFile.connectedText(CLAUDE_HOOKS, text, port);
export const disconnectedText = (text: string | undefined) =>
  hookFile.disconnectedText(CLAUDE_HOOKS, text);
