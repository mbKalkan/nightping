// Whether the user is at VS Code on this computer, in any window. The window that receives the
// agents' events is often not the one the user works in. Each window writes its state to a file
// of its own in the extension's global storage folder, which every window of the computer
// shares: `globalState` would not do, because VS Code keeps it as one value per extension and a
// window that writes it overwrites what another window wrote a moment before. A focused window
// writes itself again every few seconds, so one that crashed while focused soon stops counting.
import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Presence as WindowState } from './filter';

/** How often the focused window writes itself again. */
export const HEARTBEAT_MS = 10_000;

/** A focused window that has not written for this long is gone. */
export const FRESH_MS = 30_000;

/** Files this old are from windows that closed without saying so; they are removed. */
export const FORGET_MS = 24 * 60 * 60_000;

/** The windows' records, one file each. Best effort: a file that fails to write just does not count. */
export interface Board {
  /** Every window's record, by window. */
  all(): Map<string, unknown>;
  set(window: string, record: unknown): void;
  delete(window: string): void;
  /** Removes the records last written before `time`. */
  prune(time: number): void;
}

export function folderBoard(folder: string): Board {
  const file = (window: string) => join(folder, `${window}.json`);
  const names = () => {
    try {
      return readdirSync(folder).filter((name) => name.endsWith('.json'));
    } catch {
      return [];
    }
  };
  return {
    all() {
      const records = new Map<string, unknown>();
      for (const name of names()) {
        try {
          records.set(
            name.slice(0, -'.json'.length),
            JSON.parse(readFileSync(join(folder, name), 'utf8')),
          );
        } catch {
          // Being written, or not JSON: it does not count.
        }
      }
      return records;
    },
    set(window, record) {
      try {
        mkdirSync(folder, { recursive: true });
        writeFileSync(file(window), JSON.stringify(record));
      } catch {
        // The storage folder is read-only or gone: this window just does not count.
      }
    },
    delete(window) {
      rmSync(file(window), { force: true });
    },
    prune(time) {
      for (const name of names()) {
        try {
          if (statSync(join(folder, name)).mtimeMs < time)
            rmSync(join(folder, name), { force: true });
        } catch {
          // Removed by another window in the meantime.
        }
      }
    },
  };
}

interface Record extends WindowState {
  at: number;
}

function readRecord(saved: unknown): Record | undefined {
  if (typeof saved !== 'object' || saved === null) return undefined;
  const { focused, active, at } = saved as { [key: string]: unknown };
  return typeof focused === 'boolean' && typeof active === 'boolean' && typeof at === 'number'
    ? { focused, active, at }
    : undefined;
}

export class Presence {
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly board: Board,
    private readonly own: () => WindowState,
    private readonly id: string = randomUUID(),
    private readonly now: () => number = Date.now,
  ) {}

  /** Removes what closed windows left, then writes this window. */
  start(): void {
    this.board.prune(this.now() - FORGET_MS);
    this.changed();
  }

  /** Call whenever this window's state changes. */
  changed(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.write();
    if (this.own().focused) this.timer = setInterval(() => this.write(), HEARTBEAT_MS);
  }

  /** This window's state; focused and active instead when the user is at another window. */
  state(): WindowState {
    const own = this.own();
    if (own.focused && own.active) return own;
    const now = this.now();
    for (const [window, saved] of this.board.all()) {
      const record = readRecord(saved);
      if (window !== this.id && record?.focused && record.active && now - record.at < FRESH_MS) {
        return { focused: true, active: true };
      }
    }
    return own;
  }

  dispose(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.board.delete(this.id);
  }

  private write(): void {
    const { focused, active } = this.own();
    this.board.set(this.id, { focused, active, at: this.now() });
  }
}
