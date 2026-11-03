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
  | { type: 'openSettings' };
