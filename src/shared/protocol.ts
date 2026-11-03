// Messages between the extension host and the Nightping panel.

/** Every text the panel shows, already in the user's language. */
export interface PanelStrings {
  title: string;
  tagline: string;
  status: Record<PanelStatus, string>;
  destination: string;
  server: string;
  serverHelp: string;
  serverInvalid: string;
  topic: string;
  topicHelp: string;
  topicInvalid: string;
  randomTopic: string;
  token: string;
  tokenHelp: string;
  tokenPlaceholder: string;
  tokenSaved: string;
  tokenInvalid: string;
  removeToken: string;
  save: string;
  sendTest: string;
  sending: string;
  saved: string;
  /** `{0}` is the time. */
  sentAt: string;
  whenToNotify: string;
  events: string;
  sources: Record<SourceKind, string>;
  terminalHelp: string;
  terminalNone: string;
  learnMore: string;
  conditions: string;
  minimum: string;
  minimumHelp: string;
  noMinimum: string;
  /** `{0}` is a number. */
  seconds: string;
  oneMinute: string;
  /** `{0}` is a number. */
  minutes: string;
  onlyWhenAway: string;
  onlyWhenAwayHelp: string;
  content: string;
  contentLevels: Record<ContentLevel, string>;
  contentHelp: string;
  preview: string;
  previewHelp: string;
  appliesNow: string;
  recent: string;
  recentEmpty: string;
  recentNote: string;
  clearRecent: string;
  sent: string;
  notSent: string;
  allSettings: string;
  privacy: string;
}

export type PanelStatus = 'ready' | 'incomplete' | 'invalid';

/** What can finish in VS Code and send a notification. */
export type SourceKind = 'task' | 'terminal' | 'notebook' | 'debug';

export const SOURCE_KINDS: readonly SourceKind[] = ['task', 'terminal', 'notebook', 'debug'];

/** How much a notification says: each level adds to the one before. */
export type ContentLevel = 'result' | 'folder' | 'details';

export const CONTENT_LEVELS: readonly ContentLevel[] = ['result', 'folder', 'details'];

/** When Nightping notifies and what it says, as the settings hold it. */
export interface NotifyPrefs {
  sources: Record<SourceKind, boolean>;
  /** Successful runs shorter than this stay quiet; failures notify at any length. */
  minimumSeconds: number;
  /** Quiet while the user is using this VS Code window. */
  onlyWhenAway: boolean;
  content: ContentLevel;
}

export type PrefChange =
  | { key: 'source'; source: SourceKind; on: boolean }
  | { key: 'minimumSeconds'; seconds: number }
  | { key: 'onlyWhenAway'; on: boolean }
  | { key: 'content'; content: ContentLevel };

/** A notification as the phone shows it: the emoji ntfy puts before the title. */
export interface NotificationPreview {
  emoji: string;
  title: string;
  message: string;
}

/** One notification Nightping tried to send. */
export interface SentEntry {
  /** Milliseconds since the epoch. */
  time: number;
  title: string;
  message: string;
  /** Why it was not sent, in the user's language; absent when it was. */
  error?: string;
}

export interface PanelState {
  /** The settings as they are, so the form can show and fix an invalid value. */
  server: string;
  topic: string;
  /** Whether a token is saved. The token itself never reaches the panel. */
  hasToken: boolean;
  status: PanelStatus;
  /** Newest first. */
  history: SentEntry[];
  prefs: NotifyPrefs;
  /** The same sample event at each content level. */
  previews: Record<ContentLevel, NotificationPreview>;
  /** Open terminals, and how many of them report their commands (shell integration). */
  terminals: { open: number; reporting: number };
}

export type HostToWebviewMessage =
  | { type: 'init'; locale: string; strings: PanelStrings }
  | { type: 'state'; state: PanelState }
  | { type: 'busy'; busy: boolean }
  | { type: 'saved' }
  | { type: 'result'; time: number; error?: string };

export type WebviewToHostMessage =
  | { type: 'ready' }
  /** An empty token keeps the saved one. With `test`, a test notification follows the save. */
  | { type: 'save'; server: string; topic: string; token: string; test: boolean }
  | { type: 'sendTest' }
  | { type: 'removeToken' }
  | { type: 'clearHistory' }
  | { type: 'openSettings' }
  | { type: 'setPref'; change: PrefChange }
  | { type: 'openShellIntegrationHelp' };
