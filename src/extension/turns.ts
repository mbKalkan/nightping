// Turns an agent's hook into the event Nightping notifies about, and times each turn from the
// prompt that started it. Pure: the clock is passed in.
import * as path from 'node:path';
import type { HookEvent } from './claude/payload';
import type { AgentKind, FinishedEvent } from './events';

/** Turns whose end never came (a closed console) are forgotten after this many. */
const TURN_LIMIT = 100;

export class Turns {
  private readonly started = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  /** The event to notify about; nothing for a prompt, which only starts the clock. */
  event(agent: AgentKind, hook: HookEvent): FinishedEvent | undefined {
    if (hook.kind === 'prompt') {
      this.started.delete(hook.session);
      this.started.set(hook.session, this.now());
      // A Map keeps insertion order: the first key is the oldest turn.
      if (this.started.size > TURN_LIMIT) {
        this.started.delete(this.started.keys().next().value as string);
      }
      return undefined;
    }
    const folder = hook.cwd ? path.basename(hook.cwd) : undefined;
    if (hook.kind === 'stop') {
      const start = this.started.get(hook.session);
      this.started.delete(hook.session);
      return {
        kind: agent,
        state: 'finished',
        durationMs: start === undefined ? undefined : this.now() - start,
        folder,
        reply: hook.reply,
        detail: undefined,
      };
    }
    return {
      kind: agent,
      state: hook.need,
      durationMs: undefined,
      folder,
      reply: undefined,
      detail: hook.message,
    };
  }
}
