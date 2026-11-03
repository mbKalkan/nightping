// Whether a finished run sends a notification. Pure: the caller passes the window state.
import type { NotifyPrefs } from '../shared/protocol';
import { outcomeOf, type FinishedEvent } from './events';

/** VS Code's `window.state`: focused, and used in the last few seconds. */
export interface Presence {
  focused: boolean;
  active: boolean;
}

export type Decision =
  | 'send'
  /** That kind of event is turned off. */
  | 'off'
  /** The user is at this window and sees it finish. */
  | 'present'
  /** It succeeded faster than the minimum duration. */
  | 'short';

export function decide(event: FinishedEvent, prefs: NotifyPrefs, presence: Presence): Decision {
  if (!prefs.sources[event.kind]) return 'off';
  if (prefs.onlyWhenAway && presence.focused && presence.active) return 'present';
  if (outcomeOf(event).kind !== 'failed' && event.durationMs < prefs.minimumSeconds * 1000) {
    return 'short';
  }
  return 'send';
}
