// The last notifications Nightping tried to send, kept in `globalState`: on this computer only,
// not synced. Pure: takes the store, so tests need no VS Code.
import type { SentEntry } from '../shared/protocol';

export interface Store {
  get<T>(key: string, fallback: T): T;
  update(key: string, value: unknown): Thenable<void>;
}

const KEY = 'nightping.history';
export const HISTORY_LIMIT = 50;

export class History {
  private readonly listeners = new Set<() => void>();

  constructor(private readonly store: Store) {}

  entries(): SentEntry[] {
    const saved = this.store.get<unknown>(KEY, []);
    return Array.isArray(saved) ? (saved as SentEntry[]) : [];
  }

  async add(entry: SentEntry): Promise<void> {
    await this.store.update(KEY, [entry, ...this.entries()].slice(0, HISTORY_LIMIT));
    this.changed();
  }

  async clear(): Promise<void> {
    await this.store.update(KEY, []);
    this.changed();
  }

  /** Calls `listener` after every change; the returned function stops it. */
  onDidChange(listener: () => void): { dispose(): void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }
}
