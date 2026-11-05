// User-facing text that the panel and the commands share. Every message goes through `t`:
// VS Code's `l10n.t` in the extension, a plain formatter in tests, so both show the same words.
import { isOnTailscale, NAME_LIMIT } from '../shared/destination';
import { NTFY_PORT } from '../shared/guide';
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
      off: t('Turned off'),
      invalid: t('Check the settings'),
    },
    pause: t('Pause Notifications…'),
    resume: t('Resume'),
    pausedUntil: t('Paused until {0}', '{0}'),
    pausedUntilResumed: t('Paused until you resume'),
    destinations: {
      title: t('Where notifications go'),
      topicOn: t('Topic {0} on {1}', '{0}', '{1}'),
      topicOnly: t('Topic {0}', '{0}'),
      offNote: t('Turned off: nothing is sent here until you tick it.'),
      sendHere: t('Send notifications here'),
      problem: {
        server: t('The server address in the settings is not valid. Click Edit to fix it.'),
        topic: t('The topic in the settings is not valid. Click Edit to fix it.'),
      },
      sendTest: t('Send Test'),
      edit: t('Edit'),
      remove: t('Remove Destination'),
      add: t('Add Another Destination'),
      chooseLead: t('How should notifications reach your phone?'),
      ways: {
        'ntfy-sh': {
          title: 'ntfy.sh',
          help: t('A free public server. Ready in two minutes: you only install an app.'),
        },
        'own-server': {
          title: t('Your own ntfy server'),
          help: t('You already run ntfy, at home or at work, at an address this computer reaches.'),
        },
        tailscale: {
          title: t('Your own server over Tailscale'),
          help: t(
            'Private: only your own devices reach the server. Nightping walks you through setting it up.',
          ),
        },
      },
      easiest: t('Easiest'),
      otherWays: t('Choose another way'),
      steps: {
        tailscale: {
          title: t('Put Tailscale on your devices'),
          help: t(
            'Tailscale joins your devices in a private network. Install it on this computer, on the computer that will run the server and on your phone, and sign in with the same account on all three.',
          ),
        },
        app: {
          title: t('Install the ntfy app on your phone'),
          help: t('ntfy is a free app that shows these notifications. Get it from:'),
        },
        server: {
          title: t('Enter your server'),
          help: t('The address you open the ntfy web app with, such as https://ntfy.example.com.'),
        },
        pickServer: {
          title: t('Choose the server'),
          help: t(
            'The computer that runs ntfy. It has to stay on and be on Tailscale; this computer works too.',
          ),
        },
        run: {
          title: t('Run ntfy on it'),
          help: t(
            'On that computer, run these two commands in a terminal. The first starts ntfy with Docker; the second lets only your Tailscale devices reach it, over HTTPS.',
          ),
        },
        topic: {
          title: t('Subscribe to this topic in the app'),
          help: t(
            'Open the ntfy app on your phone, tap + and enter this topic. Your notifications go out under this name.',
          ),
        },
        topicOwn: {
          title: t('Subscribe to this topic in the app'),
          help: t(
            'Open the ntfy app on your phone and tap +. Turn on “Use another server”, enter {0}, then this topic.',
            '{0}',
          ),
        },
        topicTailscale: {
          title: t('Subscribe on your phone'),
          help: t(
            'Install the ntfy app and turn Tailscale on. In the app, tap +, turn on “Use another server”, enter {0}, then this topic.',
            '{0}',
          ),
        },
        topicExisting: {
          title: t('Use the topic of your phone'),
          help: t(
            'If your phone already gets notifications from {0}, enter the topic it is subscribed to. If not, in the ntfy app tap +, turn on “Use another server”, enter {0}, then this topic.',
            '{0}',
          ),
        },
        save: {
          title: t('Name it and send a test'),
          help: t(
            'The name is only for this list. The test should reach your phone within a few seconds.',
          ),
        },
      },
      server: t('Server address'),
      serverInvalid: t(
        'Enter an http:// or https:// address such as https://ntfy.sh, without a user name, password, ? or #.',
      ),
      topic: t('Topic'),
      topicHelp: t(
        'Anyone who knows the topic can read your notifications, so keep this random name.',
      ),
      topicInvalid: t('Use only letters, numbers, - and _, up to 64 characters.'),
      duplicate: t('This topic on this server is already in the list.'),
      copy: t('Copy'),
      copied: t('Copied'),
      randomTopic: t('New Name'),
      addToken: t('My server needs an access token'),
      token: t('Access token'),
      tokenHelp: t(
        'It is kept in the secret storage of VS Code on this computer, never in the settings.',
      ),
      tokenSaved: t('Saved. Type a new token to replace it.'),
      tokenInvalid: t('An access token has no spaces or special characters.'),
      removeToken: t('Clear Access Token'),
      enterToken: t('Set Access Token'),
      name: t('Name'),
      nameHelp: t('Optional. Left empty, the list shows {0}.', '{0}'),
      nameInvalid: t('Use up to {0} characters.', NAME_LIMIT),
      saveAndTest: t('Save and Send Test'),
      cancel: t('Cancel'),
      sentTo: t(
        'Sent to {1} at {0}. If it is not on your phone, check that the app is subscribed to its topic.',
        '{0}',
        '{1}',
      ),
      sentAt: t(
        'Sent at {0}. If it is not on your phone, check that the app is subscribed to the topic.',
        '{0}',
      ),
      tailscale: {
        download: t('Download Tailscale'),
        check: t('Check Again'),
        checking: t('Looking for Tailscale on this computer…'),
        state: {
          ready: t('This computer is on Tailscale as {0}.', '{0}'),
          missing: t('Tailscale is not on this computer yet. Install it, then click Check Again.'),
          off: t('Tailscale is installed but not connected. Turn it on, then click Check Again.'),
          'signed-out': t('Tailscale is installed. Sign in to it, then click Check Again.'),
        },
        thisComputer: t('this computer'),
        offline: t('offline'),
        offlineChosen: t('{0} is offline right now. Turn it on before you send the test.', '{0}'),
        noDevices: t(
          'No computer is on your Tailscale yet. Install Tailscale on the server, then click Check Again.',
        ),
        noMagicDns: t(
          'MagicDNS is off in your Tailscale, so your devices have no names to use as an address. Turn it on in the DNS settings of the Tailscale admin console.',
        ),
        openDns: t('Open DNS Settings'),
        typeAddress: t('Server address'),
        server: {
          checking: t('Checking whether ntfy runs on {0}…', '{0}'),
          running: t('ntfy already runs on {0}, so there is nothing to set up there.', '{0}'),
          none: t(
            'No ntfy answers on {0} yet: set it up in the next step. If you already did, check that {0} is on.',
            '{0}',
          ),
        },
      },
      delegate: {
        button: t('Delegate to Agent'),
        help: {
          tailscale: t(
            'Or let an AI agent put Tailscale on a computer: paste the prompt into Claude Code, Codex or Copilot there.',
          ),
          ntfy: t(
            'Or let an AI agent do this on the server: paste the prompt into Claude Code, Codex or Copilot there.',
          ),
          token: t(
            'No token yet? An AI agent on your ntfy server can make one: paste the prompt into Claude Code, Codex or Copilot there.',
          ),
        },
        show: t('See the prompt'),
        copied: t(
          'Copied. Paste it into the chat of your agent; it asks before it changes anything.',
        ),
      },
      prompts: {
        tailscale: [
          t(
            'Install Tailscale on this computer and connect it to my Tailscale network, for phone notifications from Nightping (a VS Code extension).',
          ),
          '',
          t(
            '1. If `tailscale status` already works and this computer is connected, stop and tell me its Tailscale name.',
          ),
          t(
            '2. Otherwise install Tailscale the way https://tailscale.com/download describes for this operating system.',
          ),
          t(
            '3. Run `tailscale up`, give me the sign-in link it shows, and wait until I have signed in.',
          ),
          t(
            '4. Check with `tailscale status --json` that MagicDNS is on (CurrentTailnet.MagicDNSEnabled). If it is off, tell me to turn it on at https://login.tailscale.com/admin/dns.',
          ),
          t('5. Tell me the Tailscale name and the MagicDNS address of this computer.'),
          '',
          t('Ask me before you install anything or change a system setting.'),
        ],
        ntfy: [
          t(
            'Set up an ntfy server on this computer for phone notifications from Nightping (a VS Code extension). Only my own Tailscale devices may reach it, at {0}.',
            '{0}',
          ),
          '',
          t('What it needs:'),
          t(
            '- ntfy listens only on 127.0.0.1:{0}, so nothing outside this computer reaches it directly.',
            NTFY_PORT,
          ),
          t(
            '- Its base-url is {0} and its upstream-base-url is https://ntfy.sh, so iPhones get notifications at once.',
            '{0}',
          ),
          t('- Its message cache is a file, and it starts again by itself after a restart.'),
          t(
            '- `tailscale serve` publishes it over HTTPS to my Tailscale devices only. No port is opened to the internet.',
          ),
          '',
          t('Steps:'),
          t(
            '1. Check with `tailscale status --json` that this computer is the one at {0} (Self.DNSName). If it is not, stop and tell me.',
            '{0}',
          ),
          t('2. If Docker is installed, run this command:'),
          '{1}',
          t(
            'Without Docker, install ntfy the way https://docs.ntfy.sh/install/ describes for this operating system, put the settings above into its server.yml (listen-http, base-url, upstream-base-url, cache-file) and run it as a service.',
          ),
          t('3. Run this command:'),
          '{2}',
          t(
            'If it shows a link to turn on HTTPS, give me the link and wait until I tell you it is done.',
          ),
          t('4. Check that {0}/v1/health answers with "healthy": true.', '{0}'),
          t('5. Tell me what you installed and changed, and how to stop or remove it.'),
          '',
          t('Ask me before you install anything or change a system setting.'),
        ],
        token: [
          t(
            'On my ntfy server at {0}, keep the topic {1} private and give Nightping (a VS Code extension) an access token of its own that may only publish to it.',
            '{0}',
            '{1}',
          ),
          '',
          t(
            '1. Find the server.yml of ntfy (often /etc/ntfy/server.yml) and show me its access control settings.',
          ),
          t(
            '2. If access control is off, it needs auth-file and auth-default-access: "deny-all". Every other topic on this server becomes private too, so ask me first; then restart ntfy.',
          ),
          t('3. Create a user that may only publish to this topic, and a token for it:'),
          'ntfy user add nightping',
          'ntfy access nightping {1} write-only',
          'ntfy token add nightping',
          t(
            '4. Show me the token once, so I can paste it into Nightping. Do not save it anywhere else.',
          ),
          t(
            '5. To read the topic on my phone I need a user too: offer to create one that may read {0}.',
            '{1}',
          ),
          '',
          t('Ask me before you install anything or change a system setting.'),
        ],
      },
      run: {
        placeholder: 'https://SERVER.TAILNET.ts.net',
        otherWays: t('Other ways to install ntfy'),
        note: t(
          'No Docker? Install ntfy another way, have it listen on port {0}, then run the second command. The first time, tailscale serve shows a link to turn on HTTPS for your devices.',
          NTFY_PORT,
        ),
      },
    },
    sending: t('Sending…'),
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
    agentsHelp: t(
      'Connect an agent once, and you get a notification when it finishes or needs you.',
    ),
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
    partlySent: t('Partly sent'),
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

/** Why nothing was sent while there is no destination to send to. */
export function notReadyText(t: Translate, state: 'incomplete' | 'off' | 'invalid'): string {
  switch (state) {
    case 'incomplete':
      return t('Nightping is not set up yet.');
    case 'off':
      return t('Every destination is turned off.');
    case 'invalid':
      return t('The ntfy server or topic in the settings is not valid.');
  }
}

/**
 * Why a notification did not go out, in a sentence that names the next step. `local` is where it
 * went on the server computer itself: the address its `tailscale serve` passes the server on to.
 */
export function failureText(
  t: Translate,
  result: Exclude<PublishResult, { ok: true }>,
  server: string,
  hasToken: boolean,
  local?: string,
): string {
  if (local !== undefined && result.reason === 'unreachable') {
    return t('Could not reach ntfy on this computer at {0} ({1}).', local, result.detail);
  }
  if (local !== undefined && result.reason === 'timeout') {
    return t(
      'ntfy on this computer did not answer at {0} within {1} seconds.',
      local,
      result.seconds,
    );
  }
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
      return withTailscale(t, server, t('Could not reach {0} ({1}).', server, result.detail));
    case 'timeout':
      return withTailscale(
        t,
        server,
        t('{0} did not answer within {1} seconds.', server, result.seconds),
      );
  }
}

/** A MagicDNS address is reached only over Tailscale, so that is the first thing to check. */
function withTailscale(t: Translate, server: string, text: string): string {
  if (!isOnTailscale(server)) return text;
  return `${text} ${t('It is on Tailscale: check that Tailscale is connected on this computer and that the server computer is on.')}`;
}
