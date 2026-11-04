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
  /** The "Your phone" card. */
  destination: string;
  /** The setup steps, in order; each has a title and a line that says what to do. */
  steps: Record<'app' | 'server' | 'topic' | 'test', { title: string; help: string }>;
  server: string;
  useNtfySh: string;
  serverInvalid: string;
  topic: string;
  /** How to subscribe on one's own server; `{0}` is its address. */
  topicOwnServer: string;
  topicHelp: string;
  topicInvalid: string;
  copyTopic: string;
  copied: string;
  randomTopic: string;
  addToken: string;
  token: string;
  tokenHelp: string;
  tokenSaved: string;
  tokenInvalid: string;
  removeToken: string;
  saveAndTest: string;
  /** Beside Save and Send Test while there is no server yet. */
  chooseServerFirst: string;
  cancel: string;
  /** `{0}` is the topic, `{1}` the server. */
  sendingTo: string;
  change: string;
  sendTest: string;
  sending: string;
  /** `{0}` is the time. */
  sentAt: string;
  /** The "When you get a notification" card. */
  whenToNotify: string;
  /**
   * The rules: a sentence, then one line for presence and one for duration.
   * In `minimum`, `{0}` is the minimum duration.
   */
  rules: Record<'lead' | 'away' | 'present' | 'minimum' | 'anyDuration', string>;
  previewHelp: string;
  vscodeEvents: string;
  agents: string;
  agentsHelp: string;
  /** Beside the warning that another program holds the port. */
  openSettings: string;
  sources: Record<SourceKind, string>;
  terminalHelp: string;
  terminalNone: string;
  learnMore: string;
  changeRules: string;
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
  claude: AgentStrings;
  codex: AgentStrings;
  copilot: AgentStrings;
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

/** The texts of an agent's row. */
export interface AgentStrings {
  title: string;
  state: Record<AgentStatus['hooks'], string>;
  /** `{0}` is the settings file. */
  help: Record<AgentStatus['hooks'], string>;
  connect: string;
  reconnect: string;
  disconnect: string;
  copy: string;
  howItWorks: string;
  /** What the user still has to do once the hooks are in, if anything. */
  nextStep?: string;
  /** `{0}` is the port. */
  receivingState: Record<AgentStatus['receiving'], string>;
  receivingHelp: string;
}

export type PanelStatus = 'ready' | 'incomplete' | 'invalid';

/** The AI agents whose hooks post to Nightping. */
export type AgentKind = 'claude' | 'codex' | 'copilot';

export const AGENT_KINDS: readonly AgentKind[] = ['claude', 'codex', 'copilot'];

/** Where the ntfy app is, by the stores' own names; the host holds the addresses. */
export const APP_STORES = {
  'google-play': 'Google Play',
  'f-droid': 'F-Droid',
  'app-store': 'App Store',
} as const;

export type AppStore = keyof typeof APP_STORES;

/** Longer messages are cut: a phone shows a few lines, and ntfy turns 4 KB into a file. */
export const MESSAGE_LIMIT = 1000;

/** What can finish in VS Code and send a notification. */
export type SourceKind =
  'task' | 'terminal' | 'notebook' | 'debug' | 'claude' | 'codex' | 'copilot';

export const SOURCE_KINDS: readonly SourceKind[] = [
  'task',
  'terminal',
  'notebook',
  'debug',
  'claude',
  'codex',
  'copilot',
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

/** An agent's hooks and the endpoint they post to. */
export interface AgentStatus {
  hooks: 'connected' | 'outdated' | 'disconnected' | 'invalid';
  /** The agent's settings folder exists: the agent is on this computer. */
  found: boolean;
  /** The file Nightping writes the hooks to, with `~` for the home folder. */
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
  claude: AgentStatus;
  codex: AgentStatus;
  copilot: AgentStatus;
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
  | { type: 'openAppStore'; store: AppStore }
  /** The topic as typed: it may not be saved yet. */
  | { type: 'copyTopic'; topic: string }
  | { type: 'connectAgent'; agent: AgentKind }
  | { type: 'disconnectAgent'; agent: AgentKind }
  | { type: 'copyAgentSettings'; agent: AgentKind };
