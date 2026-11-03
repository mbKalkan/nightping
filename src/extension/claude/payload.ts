// Reads what a Claude Code hook sends. The payload is untrusted input from any local program:
// only known fields of the right type are kept, and long text is cut. Pure: no VS Code.

export type HookEvent =
  /** The user sent a prompt: a turn starts. */
  | { kind: 'prompt'; session: string }
  /** Claude finished its turn. */
  | { kind: 'stop'; session: string; cwd: string | undefined; reply: string | undefined }
  /** Claude waits for the user: a permission, or an answer to its question. */
  | {
      kind: 'needs';
      session: string;
      cwd: string | undefined;
      need: 'approval' | 'question';
      message: string | undefined;
    };

const SESSION_LIMIT = 200;
const CWD_LIMIT = 1000;
/** Enough for the first sentence of a long reply. */
const REPLY_LIMIT = 4000;
const MESSAGE_LIMIT = 300;
const QUESTION_TYPES = new Set([
  'elicitation_dialog',
  'elicitation_url_dialog',
  'agent_needs_input',
]);

/** The event a payload stands for, or `undefined` for one Nightping does not notify about. */
export function readHook(payload: unknown): HookEvent | undefined {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined;
  const p = payload as Record<string, unknown>;
  const session = text(p.session_id, SESSION_LIMIT) ?? 'default';
  const cwd = text(p.cwd, CWD_LIMIT);
  switch (p.hook_event_name) {
    case 'UserPromptSubmit':
      return { kind: 'prompt', session };
    case 'Stop':
      // A subagent still runs: Claude goes on when it is done, so the turn has not ended. A
      // background shell (a dev server) may never end, so only subagents count.
      if (subagentRunning(p.background_tasks)) return undefined;
      return { kind: 'stop', session, cwd, reply: text(p.last_assistant_message, REPLY_LIMIT) };
    case 'Notification': {
      const message = text(p.message, MESSAGE_LIMIT);
      if (p.notification_type === 'permission_prompt') {
        // Claude's questions arrive as a permission prompt for its AskUserQuestion tool.
        const need = message?.includes('AskUserQuestion') ? 'question' : 'approval';
        return { kind: 'needs', session, cwd, need, message };
      }
      // A form or a link from an MCP server, or a background agent that needs an answer.
      if (QUESTION_TYPES.has(p.notification_type as string)) {
        return { kind: 'needs', session, cwd, need: 'question', message };
      }
      // `idle_prompt` comes a minute after a finished turn, which already notified; the others
      // (sign-in done, a background agent done, plugin messages) are not about the user's turn.
      return undefined;
    }
    default:
      return undefined;
  }
}

function subagentRunning(tasks: unknown): boolean {
  return (
    Array.isArray(tasks) &&
    tasks.some(
      (task) =>
        typeof task === 'object' &&
        task !== null &&
        (task as Record<string, unknown>).type === 'subagent' &&
        (task as Record<string, unknown>).status === 'running',
    )
  );
}

function text(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  return trimmed.length > limit ? trimmed.slice(0, limit) : trimmed;
}
