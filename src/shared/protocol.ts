// Messages between the extension host and the Nightping panel.

/** Every text the panel shows, already in the user's language. */
export interface PanelStrings {
  title: string;
  tagline: string;
  status: Record<PanelStatus, string>;
  pause: string;
  resume: string;
  /** `{0}` is the time. */
  pausedUntil: string;
  pausedUntilResumed: string;
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
  claude: {
    title: string;
    hooks: string;
    state: Record<ClaudeStatus['hooks'], string>;
    /** `{0}` is the settings file. */
    help: Record<ClaudeStatus['hooks'], string>;
    connect: string;
    reconnect: string;
    disconnect: string;
    copy: string;
    receiving: string;
    /** `{0}` is the port. */
    receivingState: Record<ClaudeStatus['receiving'], string>;
    receivingHelp: string;
  };
  message: {
    title: string;
    label: string;
    placeholder: string;
    help: string;
    send: string;
    /** `{0}` is the time. */
    sentAt: string;
  };
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

/** Longer messages are cut: a phone shows a few lines, and ntfy turns 4 KB into a file. */
export const MESSAGE_LIMIT = 1000;

/** What can finish in VS Code and send a notification. */
export type SourceKind = 'task' | 'terminal' | 'notebook' | 'debug' | 'claude';

export const SOURCE_KINDS: readonly SourceKind[] = [
  'task',
  'terminal',
  'notebook',
  'debug',
  'claude',
];

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

/** Claude Code's hooks and the endpoint they post to. */
export interface ClaudeStatus {
  hooks: 'connected' | 'outdated' | 'disconnected' | 'invalid';
  /** Claude Code's settings folder exists: Claude Code is on this computer. */
  found: boolean;
  /** Claude Code's user settings file, with `~` for the home folder. */
  file: string;
  receiving: 'off' | 'listening' | 'other-window' | 'other-program';
  port: number;
}

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
  /** Present while notifications are paused; without `until`, until the user resumes. */
  pause?: { until?: number };
  /** Newest first. */
  history: SentEntry[];
  prefs: NotifyPrefs;
  /** The same sample event at each content level. */
  previews: Record<ContentLevel, NotificationPreview>;
  /** Open terminals, and how many of them report their commands (shell integration). */
  terminals: { open: number; reporting: number };
  claude: ClaudeStatus;
}

export type HostToWebviewMessage =
  | { type: 'init'; locale: string; strings: PanelStrings }
  | { type: 'state'; state: PanelState }
  | { type: 'busy'; busy: boolean }
  | { type: 'saved' }
  | { type: 'result'; time: number; error?: string }
  /** How the message typed in the panel went. */
  | { type: 'messageResult'; time: number; error?: string };

export type WebviewToHostMessage =
  | { type: 'ready' }
  /** An empty token keeps the saved one. With `test`, a test notification follows the save. */
  | { type: 'save'; server: string; topic: string; token: string; test: boolean }
  | { type: 'sendTest' }
  /** A message the user typed; it goes out even while notifications are paused. */
  | { type: 'send'; message: string }
  | { type: 'removeToken' }
  | { type: 'clearHistory' }
  | { type: 'openSettings' }
  | { type: 'setPref'; change: PrefChange }
  /** The host asks how long, in VS Code's own list. */
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'openShellIntegrationHelp' }
  | { type: 'connectClaude' }
  | { type: 'disconnectClaude' }
  | { type: 'copyClaudeSettings' };
