// Something that finished in VS Code, as the sources report it. Pure: no VS Code.
import type { SourceKind } from '../shared/protocol';

interface Run {
  kind: SourceKind;
  durationMs: number;
}

export type FinishedEvent =
  | (Run & { kind: 'task'; name: string; exitCode: number | undefined })
  | (Run & { kind: 'terminal'; commandLine: string; exitCode: number | undefined })
  | (Run & { kind: 'notebook'; file: string; cell: number; success: boolean | undefined })
  | (Run & { kind: 'debug'; name: string });

export type Outcome =
  | { kind: 'succeeded' }
  | { kind: 'failed'; exitCode?: number }
  /** It ended, but VS Code does not say how. */
  | { kind: 'finished' };

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
  }
}
