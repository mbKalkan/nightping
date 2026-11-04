// Something that finished, or waits for the user, as the sources report it. Pure: no VS Code.
import type { AgentKind, SourceKind } from '../shared/protocol';

interface Run {
  kind: SourceKind;
  durationMs: number;
}

export type FinishedEvent =
  | (Run & { kind: 'task'; name: string; exitCode: number | undefined })
  | (Run & { kind: 'terminal'; commandLine: string; exitCode: number | undefined })
  | (Run & { kind: 'notebook'; file: string; cell: number; success: boolean | undefined })
  | (Run & { kind: 'debug'; name: string })
  | {
      kind: AgentKind;
      state: 'finished' | 'approval' | 'question';
      /** Unknown when Nightping did not see the prompt that started the turn. */
      durationMs: number | undefined;
      /** The agent's working folder, by name. */
      folder: string | undefined;
      /** The agent's last reply, for a finished turn. */
      reply: string | undefined;
      /** The agent's own words about what it waits for. */
      detail: string | undefined;
    };

export type { AgentKind };

export type AgentEvent = Extract<FinishedEvent, { kind: AgentKind }>;

export const AGENT_NAMES: Record<AgentKind, string> = { claude: 'Claude Code', codex: 'Codex' };

export function isAgent(event: FinishedEvent): event is AgentEvent {
  return event.kind === 'claude' || event.kind === 'codex';
}

export type Outcome =
  | { kind: 'succeeded' }
  | { kind: 'failed'; exitCode?: number }
  /** It ended, but VS Code does not say how. */
  | { kind: 'finished' }
  /** An agent waits for the user. */
  | { kind: 'needs-you' };

export function outcomeOf(event: FinishedEvent): Outcome {
  switch (event.kind) {
    case 'task':
    case 'terminal':
      if (event.exitCode === undefined) return { kind: 'finished' };
      return event.exitCode === 0
        ? { kind: 'succeeded' }
        : { kind: 'failed', exitCode: event.exitCode };
    case 'notebook':
      if (event.success === undefined) return { kind: 'finished' };
      return event.success ? { kind: 'succeeded' } : { kind: 'failed' };
    case 'debug':
      return { kind: 'finished' };
    case 'claude':
    case 'codex':
      return event.state === 'finished' ? { kind: 'finished' } : { kind: 'needs-you' };
  }
}
