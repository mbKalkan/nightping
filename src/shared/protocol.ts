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
  /** The "Where notifications go" card. */
  destinations: DestinationStrings;
  sending: string;
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
  /** It reached some destinations, not all. */
  partlySent: string;
  allSettings: string;
  privacy: string;
}

/** A step of the guide: its title and the line that says what to do. */
export interface StepText {
  title: string;
  help: string;
}

/** The texts of the "Where notifications go" card. */
export interface DestinationStrings {
  title: string;
  /** `{0}` is the topic, `{1}` the server. */
  topicOn: string;
  /** Under a destination without a name, whose title is the server already; `{0}` is the topic. */
  topicOnly: string;
  /** Under a destination that is turned off. */
  offNote: string;
  /** What a destination's checkbox does. */
  sendHere: string;
  problem: Record<'server' | 'topic', string>;
  sendTest: string;
  edit: string;
  remove: string;
  add: string;
  /** Over the three ways. */
  chooseLead: string;
  ways: Record<SetupWay, { title: string; help: string }>;
  /** Beside the easiest way. */
  easiest: string;
  otherWays: string;
  steps: {
    tailscale: StepText;
    app: StepText;
    server: StepText;
    pickServer: StepText;
    run: StepText;
    /** Subscribing on ntfy.sh. */
    topic: StepText;
    /** On one's own server; `{0}` is its address. */
    topicOwn: StepText;
    /** On one's own server over Tailscale; `{0}` is its address. */
    topicTailscale: StepText;
    save: StepText;
  };
  server: string;
  serverInvalid: string;
  topic: string;
  topicHelp: string;
  topicInvalid: string;
  duplicate: string;
  copy: string;
  copied: string;
  randomTopic: string;
  addToken: string;
  token: string;
  tokenHelp: string;
  tokenSaved: string;
  tokenInvalid: string;
  removeToken: string;
  name: string;
  /** `{0}` is the name used when the field stays empty. */
  nameHelp: string;
  nameInvalid: string;
  saveAndTest: string;
  cancel: string;
  /** `{0}` is the time, `{1}` the destination. */
  sentTo: string;
  /** `{0}` is the time. */
  sentAt: string;
  tailscale: {
    download: string;
    check: string;
    checking: string;
    /** In `ready`, `{0}` is this computer's name. */
    state: Record<TailscaleView['kind'], string>;
    thisComputer: string;
    offline: string;
    /** `{0}` is the device. */
    offlineChosen: string;
    noDevices: string;
    noMagicDns: string;
    openDns: string;
    typeAddress: string;
  };
  run: {
    /** The address in the commands until a server is chosen. */
    placeholder: string;
    otherWays: string;
    note: string;
  };
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

export type PanelStatus = 'ready' | 'incomplete' | 'off' | 'invalid';

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

/** The three ways to get notifications to a phone that the panel walks through. */
export type SetupWay = 'ntfy-sh' | 'own-server' | 'tailscale';

export const SETUP_WAYS: readonly SetupWay[] = ['ntfy-sh', 'own-server', 'tailscale'];

/** Pages the guide links to; the host holds the addresses. */
export type GuideLink = 'tailscale-download' | 'tailscale-dns' | 'ntfy-install';

/** One place notifications go, as the panel shows it. */
export interface DestinationView {
  /** Server and topic: tells destinations apart. */
  key: string;
  name: string;
  server: string;
  topic: string;
  enabled: boolean;
  /** Whether a token is saved for its server. The token itself never reaches the panel. */
  hasToken: boolean;
  problem?: 'server' | 'topic';
}

/** A computer on the user's Tailscale network that could run the ntfy server. */
export interface TailscaleDevice {
  name: string;
  os: string;
  online: boolean;
  /** This computer. */
  self: boolean;
  /** `https://` and its MagicDNS name; empty without MagicDNS. */
  address: string;
}

/** What the tailscale command on this computer says. */
export type TailscaleView =
  | { kind: 'missing' | 'off' | 'signed-out' }
  | { kind: 'ready'; name: string; magicDns: boolean; devices: TailscaleDevice[] };

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
  /** It reached some destinations; `error` names the others. */
  partial?: boolean;
}

export interface PanelState {
  /** As the settings hold them, so the panel can show and fix an invalid value. */
  destinations: DestinationView[];
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
  /** Why the destination was not saved. */
  | { type: 'notSaved'; error: string }
  /** How a test went; `to` names the one destination it went to. */
  | { type: 'result'; time: number; error?: string; to?: string }
  | { type: 'tailscale'; status: TailscaleView }
  /** The Command Palette asked for this way's guide. */
  | { type: 'guide'; way: SetupWay }
  /** How the message typed in the panel went. */
  | { type: 'messageResult'; time: number; error?: string };

export type WebviewToHostMessage =
  | { type: 'ready' }
  /**
   * Adds a destination, or with `previous` changes that one. An empty token keeps the saved one.
   * With `test`, a test notification to it follows the save.
   */
  | {
      type: 'save';
      previous?: string;
      name: string;
      server: string;
      topic: string;
      token: string;
      test: boolean;
    }
  /** To one destination, or without `key` to every one that is on. */
  | { type: 'sendTest'; key?: string }
  | { type: 'removeDestination'; key: string }
  | { type: 'setEnabled'; key: string; enabled: boolean }
  /** Asks the tailscale command on this computer for its devices. */
  | { type: 'findTailscale' }
  | { type: 'openGuide'; link: GuideLink }
  /** A message the user typed; it goes out even while notifications are paused. */
  | { type: 'send'; message: string }
  /** The token of this destination's server. */
  | { type: 'removeToken'; key: string }
  | { type: 'clearHistory' }
  | { type: 'openSettings' }
  | { type: 'setPref'; change: PrefChange }
  /** The host asks how long, in VS Code's own list. */
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'openShellIntegrationHelp' }
  | { type: 'openAppStore'; store: AppStore }
  /** A topic as typed, or a command of the guide. */
  | { type: 'copy'; text: string }
  | { type: 'connectAgent'; agent: AgentKind }
  | { type: 'disconnectAgent'; agent: AgentKind }
  | { type: 'copyAgentSettings'; agent: AgentKind };
