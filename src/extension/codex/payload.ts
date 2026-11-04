// Reads what a Codex hook sends. The payload is untrusted input from any local program: only
// known fields of the right type are kept, and long text is cut. Pure: no VS Code.
import type { HookEvent } from '../claude/payload';

const SESSION_LIMIT = 200;
const CWD_LIMIT = 1000;
/** Enough for the first sentence of a long reply. */
const REPLY_LIMIT = 4000;
const MESSAGE_LIMIT = 300;

/** The event a payload stands for, or `undefined` for one Nightping does not notify about. */
export function readCodexHook(payload: unknown): HookEvent | undefined {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined;
  const p = payload as Record<string, unknown>;
  const session = text(p.session_id, SESSION_LIMIT) ?? 'default';
  const cwd = text(p.cwd, CWD_LIMIT);
  switch (p.hook_event_name) {
    case 'UserPromptSubmit':
      return { kind: 'prompt', session };
    case 'Stop':
      return { kind: 'stop', session, cwd, reply: text(p.last_assistant_message, REPLY_LIMIT) };
    case 'PermissionRequest': {
      // What Codex asks to do: its own description of the command, or the command itself.
      const input = p.tool_input as Record<string, unknown> | null | undefined;
      const message =
        text(input?.description, MESSAGE_LIMIT) ??
        text(input?.command, MESSAGE_LIMIT) ??
        text(p.tool_name, MESSAGE_LIMIT);
      return { kind: 'needs', session, cwd, need: 'approval', message };
    }
    default:
      return undefined;
  }
}

function text(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  return trimmed.length > limit ? trimmed.slice(0, limit) : trimmed;
}
