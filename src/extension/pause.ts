// Pausing notifications for a while, or until the user resumes. Kept in `globalState`: every
// window on this computer reads it, other computers do not. Pure: takes the store and a clock.
import type { Store } from './history';

/** Without `until`, the pause lasts until the user resumes. */
export interface Pause {
  until?: number;
}

/** The lengths the pause list offers, in minutes. */
export const PAUSE_MINUTES = [30, 60, 240] as const;

/** One day: the longest pause a command argument may ask for. */
export const MAX_PAUSE_MINUTES = 1440;

const KEY = 'nightping.pause';

export function isPauseMinutes(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_PAUSE_MINUTES
  );
}

/** The pause in `saved`, unless it is malformed or over. */
export function activePause(saved: unknown, now: number): Pause | undefined {
  if (typeof saved !== 'object' || saved === null) return undefined;
  const { until } = saved as { until?: unknown };
  if (until === undefined) return {};
  return typeof until === 'number' && until > now ? { until } : undefined;
}

export class Pauser {
  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly store: Store,
    private readonly now: () => number = Date.now,
  ) {}

  current(): Pause | undefined {
    return activePause(this.store.get<unknown>(KEY, undefined), this.now());
  }

  /** Pauses for `minutes`, or until `resume` without them. */
  async pause(minutes?: number): Promise<void> {
    await this.store.update(
      KEY,
      minutes === undefined ? {} : { until: this.now() + minutes * 60_000 },
    );
    this.refresh();
  }

  async resume(): Promise<void> {
    await this.store.update(KEY, undefined);
    this.refresh();
  }

  /**
   * Tells the listeners, and again when the pause runs out. Also called when the window gets
   * focus, since another window may have paused or resumed.
   */
  refresh(): void {
    clearTimeout(this.timer);
    const until = this.current()?.until;
    if (until !== undefined) {
      // Timers fire early or late by a few milliseconds; `current()` decides, not the timer.
      this.timer = setTimeout(() => this.refresh(), Math.max(0, until - this.now()) + 50);
    }
    for (const listener of this.listeners) listener();
  }

  /** Calls `listener` after every change; the returned function stops it. */
  onDidChange(listener: () => void): { dispose(): void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.listeners.clear();
  }
}
