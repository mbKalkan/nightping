// User-facing text that the panel and the commands share. Every message goes through `t`:
// VS Code's `l10n.t` in the extension, a plain formatter in tests, so both show the same words.
import type { PanelStrings } from '../shared/protocol';
import type { Message, PublishResult } from './ntfy';

export type Translate = (message: string, ...args: Array<string | number>) => string;

export function panelStrings(t: Translate): PanelStrings {
  // What every agent's row says the same way.
  const agent = {
    state: {
      connected: t('Connected'),
      outdated: t('Needs an update'),
      disconnected: t('Not connected'),
      invalid: t('Settings file is not valid JSON'),
    },
    help: {
      outdated: t(
        'The Nightping hooks in {0} are incomplete or use another port. Reconnect to fix them.',
        '{0}',
      ),
      invalid: t(
        '{0} is not valid JSON, so Nightping does not change it. Fix it, or add the hooks yourself with Copy Settings.',
        '{0}',
      ),
    },
    connect: t('Connect'),
    reconnect: t('Reconnect'),
    disconnect: t('Disconnect'),
    copy: t('Copy Settings'),
    howItWorks: t('How it works'),
    receivingState: {
      listening: t('In this window, on port {0}.', '{0}'),
      'other-window': t('In another VS Code window, on port {0}.', '{0}'),
      'other-program': t(
        'Port {0} is used by another program. Choose another port in the settings, then reconnect.',
        '{0}',
      ),
    },
  };
  return {
    title: 'Nightping',
    tagline: t(
      'Get a notification on your phone when something you started in VS Code finishes or needs you.',
    ),
    status: {
      ready: t('Ready'),
      incomplete: t('Not set up'),
      invalid: t('Check the settings'),
    },
    pause: t('Pause Notifications…'),
    resume: t('Resume'),
    pausedUntil: t('Paused until {0}', '{0}'),
    pausedUntilResumed: t('Paused until you resume'),
    destination: t('Your phone'),
    steps: {
      app: {
        title: t('Install the ntfy app on your phone'),
        help: t('ntfy is a free app that shows these notifications. Get it from:'),
      },
      server: {
        title: t('Choose a server'),
        help: t(
          'Notifications reach your phone through an ntfy server. No server of your own? Click Use ntfy.sh: it is free and needs no account.',
        ),
      },
      topic: {
        title: t('Subscribe to this topic in the app'),
        help: t(
          'Open the ntfy app on your phone, tap + and enter this topic. Your notifications go out under this name.',
        ),
      },
      test: {
        title: t('Send a test'),
        help: t(
          'Saves the settings and sends a test. It should reach your phone within a few seconds.',
        ),
      },
    },
    server: t('Server'),
    useNtfySh: t('Use ntfy.sh'),
    serverInvalid: t(
      'Enter an http:// or https:// address such as https://ntfy.sh, without a user name, password, ? or #.',
    ),
    topic: t('Topic'),
    topicOwnServer: t(
      'On your own server, also turn on “Use another server” in the app and enter {0}.',
      '{0}',
    ),
    topicHelp: t(
      'Anyone who knows the topic can read your notifications, so keep this random name.',
    ),
    topicInvalid: t('Use only letters, numbers, - and _, up to 64 characters.'),
    copyTopic: t('Copy'),
    copied: t('Copied'),
    randomTopic: t('New Name'),
    addToken: t('My server needs an access token'),
    token: t('Access token'),
    tokenHelp: t(
      'It is kept in the secret storage of VS Code on this computer, never in the settings.',
    ),
    tokenSaved: t('Saved. Type a new token to replace it.'),
    tokenInvalid: t('An access token has no spaces or special characters.'),
    removeToken: t('Remove'),
    saveAndTest: t('Save and Send Test'),
    chooseServerFirst: t('Choose a server first.'),
    cancel: t('Cancel'),
    sendingTo: t('Notifications go to the topic {0} on {1}.', '{0}', '{1}'),
    change: t('Change'),
    sendTest: t('Send Test Notification'),
    sending: t('Sending…'),
    sentAt: t(
      'Sent at {0}. If it is not on your phone, subscribe to this topic in the ntfy app.',
      '{0}',
    ),
    whenToNotify: t('When you get a notification'),
    rules: {
      lead: t(
        'Your phone gets a notification when one of the things below finishes, fails or needs you:',
      ),
      away: t('Only while you are not using VS Code.'),
      present: t('Also while you are using VS Code.'),
      minimum: t('Only if it ran for {0} or longer, unless it failed or needs you.', '{0}'),
      anyDuration: t('However long it ran.'),
    },
    previewHelp: t('On your phone, a failed build task looks like this:'),
    vscodeEvents: t('In VS Code'),
    agents: t('AI agents'),
    agentsHelp: t('Connect an agent once; then its checkbox turns its notifications on and off.'),
    openSettings: t('Open Settings'),
    sources: {
      task: t('Tasks finish'),
      terminal: t('Terminal commands finish'),
      notebook: t('Notebook cells finish'),
      debug: t('Debug sessions end'),
      claude: t('Claude Code finishes or needs you'),
      codex: t('Codex finishes or needs you'),
      copilot: t('GitHub Copilot finishes or needs you'),
    },
    terminalHelp: t('Only in terminals that tell VS Code when a command ends (shell integration).'),
    terminalNone: t(
      'None of the open terminals tells VS Code when a command ends, so their commands cannot notify.',
    ),
    learnMore: t('Learn More'),
    changeRules: t('Change the rules'),
    minimum: t('Minimum duration'),
    minimumHelp: t('Shorter runs stay quiet, unless they fail or an agent waits for you.'),
    noMinimum: t('None'),
    seconds: t('{0} seconds', '{0}'),
    oneMinute: t('1 minute'),
    minutes: t('{0} minutes', '{0}'),
    onlyWhenAway: t('Only when I am not using VS Code'),
    onlyWhenAwayHelp: t('Quiet while you are using any VS Code window on this computer.'),
    content: t('What the notification says'),
    contentLevels: {
      result: t('Result and duration'),
      folder: t('Also the workspace name'),
      details: t('Also the task name, command line or file name'),
    },
    contentHelp: t('This text passes through your ntfy server.'),
    claude: {
      ...agent,
      title: t('Claude Code'),
      help: {
        ...agent.help,
        connected: t(
          'Claude Code tells Nightping on this computer when you send a prompt, when it finishes and when it needs you. Disconnect removes only these hooks from {0}.',
          '{0}',
        ),
        disconnected: t(
          'Connect adds three hooks to {0}: small entries that tell Nightping when you send a prompt, when Claude finishes and when it needs you, in a terminal or in VS Code. A copy of the file is kept first. Copy Settings copies the hooks, so that you can add them yourself.',
          '{0}',
        ),
      },
      receivingState: { ...agent.receivingState, off: t('Starts once Claude Code is connected.') },
      receivingHelp: t(
        'Only while VS Code is open. When it is closed, Claude Code goes on as usual.',
      ),
    },
    codex: {
      ...agent,
      title: 'Codex',
      help: {
        ...agent.help,
        connected: t(
          'Codex tells Nightping on this computer when you send a prompt, when it finishes and when it asks for your approval. Disconnect removes only these hooks from {0}.',
          '{0}',
        ),
        disconnected: t(
          'Connect adds three hooks to {0}: small entries that tell Nightping when you send a prompt, when Codex finishes and when it asks for your approval. A copy of the file is kept first, and Codex asks you to trust the hooks once. Copy Settings copies them, so that you can add them yourself.',
          '{0}',
        ),
      },
      nextStep: t(
        'One more step: type /hooks in Codex and trust the three Nightping hooks. Until then, Codex skips them.',
      ),
      receivingState: { ...agent.receivingState, off: t('Starts once Codex is connected.') },
      receivingHelp: t('Only while VS Code is open. When it is closed, Codex goes on as usual.'),
    },
    copilot: {
      ...agent,
      title: t('GitHub Copilot'),
      help: {
        ...agent.help,
        connected: t(
          'Copilot in VS Code and Copilot CLI tell Nightping on this computer when you send a prompt and when Copilot finishes; Copilot CLI also when it asks for your approval. VS Code runs the hooks in trusted workspaces only. Disconnect deletes {0}.',
          '{0}',
        ),
        disconnected: t(
          'Connect adds {0}, a hooks file only Nightping uses. Copilot in VS Code (agent mode) and Copilot CLI then tell Nightping when a turn ends, and Copilot CLI also when it waits for your approval. Copy Settings copies the file, so that you can add it yourself.',
          '{0}',
        ),
      },
      receivingState: {
        ...agent.receivingState,
        off: t('Starts once GitHub Copilot is connected.'),
      },
      receivingHelp: t(
        'Only while VS Code is open. When it is closed, Copilot CLI goes on as usual.',
      ),
    },
    message: {
      title: t('Send a message'),
      label: t('Message'),
      placeholder: t('Type a message for your phone'),
      help: t('Goes to your phone now, even while notifications are paused.'),
      send: t('Send'),
      sentAt: t('Sent at {0}.', '{0}'),
    },
    recent: t('Recent notifications'),
    recentEmpty: t('Nothing sent yet.'),
    recentNote: t('Kept on this computer only.'),
    clearRecent: t('Clear'),
    sent: t('Sent'),
    notSent: t('Not sent'),
    allSettings: t('All Settings'),
    privacy: t(
      'Nightping sends only to the server you chose. No telemetry, no other network traffic.',
    ),
  };
}

export function testMessage(t: Translate): Message {
  return {
    title: t('Nightping test'),
    message: t('Notifications from VS Code will arrive like this.'),
    tags: ['bell'],
  };
}

/** Why nothing was sent while the server or topic is missing or wrong. */
export function notReadyText(t: Translate, state: 'incomplete' | 'invalid'): string {
  return state === 'incomplete'
    ? t('Nightping is not set up yet.')
    : t('The ntfy server or topic in the settings is not valid.');
}

/** Why a notification did not go out, in a sentence that names the next step. */
export function failureText(
  t: Translate,
  result: Exclude<PublishResult, { ok: true }>,
  server: string,
  hasToken: boolean,
): string {
  switch (result.reason) {
    case 'unauthorized':
      return hasToken
        ? t('{0} refused the access token (HTTP {1}).', server, result.status)
        : t('{0} needs an access token for this topic (HTTP {1}).', server, result.status);
    case 'redirect':
      return t('{0} redirects to {1}. Use that address as the server.', server, result.location);
    case 'http':
      return result.detail
        ? t('{0} answered HTTP {1}: {2}', server, result.status, result.detail)
        : t('{0} answered HTTP {1}.', server, result.status);
    case 'unreachable':
      return t('Could not reach {0} ({1}).', server, result.detail);
    case 'timeout':
      return t('{0} did not answer within {1} seconds.', server, result.seconds);
  }
}
