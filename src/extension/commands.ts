// The command palette way to do what the panel does.
import * as vscode from 'vscode';
import type { AgentBridge } from './agentBridge';
import { hostOf, NTFY_SH } from '../shared/destination';
import type { SetupWay } from '../shared/protocol';
import {
  destinationKey,
  displayName,
  isServerUrl,
  isToken,
  isTopic,
  normalizeServer,
  suggestTopic,
} from './config';
import { currentDestinations, removeDestination, saveDestination, tokenKey } from './destinations';
import { readMessage } from './message';
import { isPauseMinutes, PAUSE_MINUTES, type Pauser } from './pause';
import type { Sender, SendOutcome } from './sender';
import { notReadyText, testMessage } from './texts';

export interface Services {
  secrets: vscode.SecretStorage;
  sender: Sender;
  pauser: Pauser;
  claude: AgentBridge;
  /** Opens the panel at a way's guide. */
  openGuide: (way: SetupWay) => void;
}

/**
 * Pauses for the minutes a key binding or another extension passes; without them, asks how long.
 * The panel's Pause button and the status bar's hover come here too.
 */
export async function pause(services: Services, minutes?: unknown): Promise<void> {
  if (isPauseMinutes(minutes)) {
    await services.pauser.pause(minutes);
    return;
  }
  const choices: Array<vscode.QuickPickItem & { minutes?: number }> = [
    ...PAUSE_MINUTES.map((m) => ({ label: pauseLength(m), minutes: m })),
    { label: vscode.l10n.t('Until I resume') },
  ];
  const choice = await vscode.window.showQuickPick(choices, {
    title: vscode.l10n.t('Pause Notifications'),
    placeHolder: vscode.l10n.t('Nothing is sent until then. Test notifications still go out.'),
  });
  if (choice) await services.pauser.pause(choice.minutes);
}

export async function resume(services: Services): Promise<void> {
  await services.pauser.resume();
}

/** What `nightping.send` gives back to a key binding or another extension. */
export type SendResult =
  | { sent: true }
  | { sent: false; reason: 'paused' | 'not-set-up' }
  | { sent: false; reason: 'failed'; error: string };

/**
 * Sends a message of one's own. Key bindings and other extensions pass it, as text or as
 * `{ message, title?, priority?, tags? }`, and get the result back; a pause holds it back. Without
 * it, asks for the text and sends that even while paused, as a test notification goes out.
 */
export async function send(services: Services, input?: unknown): Promise<SendResult | undefined> {
  if (input === undefined) {
    const text = await vscode.window.showInputBox({
      title: vscode.l10n.t('Send a Message'),
      prompt: vscode.l10n.t('Goes to your phone now, even while notifications are paused.'),
      ignoreFocusOut: true,
    });
    const typed = readMessage(vscode.l10n.t, text ?? '');
    if (!typed.ok) return undefined;
    const outcome = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Sending…') },
      () => services.sender.send(typed.message),
    );
    report(outcome, vscode.l10n.t('Message sent.'));
    return resultOf(outcome);
  }
  const passed = readMessage(vscode.l10n.t, input);
  // A key binding or extension that passes something else hears why, as an error.
  if (!passed.ok) throw new Error(`nightping.send: ${passed.problem}`);
  if (services.pauser.current() !== undefined) return { sent: false, reason: 'paused' };
  return resultOf(await services.sender.send(passed.message));
}

function resultOf(outcome: SendOutcome): SendResult {
  switch (outcome.kind) {
    case 'sent':
      return { sent: true };
    case 'not-ready':
      return { sent: false, reason: 'not-set-up' };
    case 'failed':
      return { sent: false, reason: 'failed', error: outcome.text };
  }
}

function pauseLength(minutes: number): string {
  if (minutes === 60) return vscode.l10n.t('For 1 hour');
  return minutes % 60 === 0
    ? vscode.l10n.t('For {0} hours', minutes / 60)
    : vscode.l10n.t('For {0} minutes', minutes);
}

interface Action {
  title: string;
  command: string;
  args?: unknown[];
}

const setUpAction = (): Action => ({
  title: vscode.l10n.t('Set Up…'),
  command: 'nightping.setUp',
});
const openAction = (): Action => ({
  title: vscode.l10n.t('Open Nightping'),
  command: 'nightping.open',
});
const setTokenAction = (server: string): Action => ({
  title: vscode.l10n.t('Set Access Token…'),
  command: 'nightping.setToken',
  args: [server],
});
const clearTokenAction = (server: string): Action => ({
  title: vscode.l10n.t('Clear Access Token'),
  command: 'nightping.clearToken',
  args: [server],
});
const sendTestAction = (): Action => ({
  title: vscode.l10n.t('Send Test Notification'),
  command: 'nightping.sendTest',
});

/**
 * Adds a destination: asks which way, then the server, topic and token, saves them and sends a
 * test to it. The Tailscale way needs more than questions, so it opens the panel's guide.
 */
export async function setUp(services: Services): Promise<void> {
  const ways: Array<vscode.QuickPickItem & { way: SetupWay }> = [
    {
      way: 'ntfy-sh',
      label: 'ntfy.sh',
      detail: vscode.l10n.t('A free public server. Ready in two minutes: you only install an app.'),
    },
    {
      way: 'own-server',
      label: vscode.l10n.t('Your own ntfy server'),
      detail: vscode.l10n.t(
        'You already run ntfy, at home or at work, at an address this computer reaches.',
      ),
    },
    {
      way: 'tailscale',
      label: vscode.l10n.t('Your own server over Tailscale'),
      detail: vscode.l10n.t('Opens the step-by-step guide in the Nightping panel.'),
    },
  ];
  const choice = await vscode.window.showQuickPick(ways, {
    title: vscode.l10n.t('Add a Destination'),
    placeHolder: vscode.l10n.t('How should notifications reach your phone?'),
  });
  if (!choice) return;
  if (choice.way === 'tailscale') {
    services.openGuide('tailscale');
    return;
  }
  const own = choice.way === 'own-server';
  const steps = own ? 3 : 1;
  const title = (step: number) => vscode.l10n.t('Add a Destination ({0}/{1})', step, steps);

  let server = NTFY_SH;
  if (own) {
    const typed = await vscode.window.showInputBox({
      title: title(1),
      prompt: vscode.l10n.t('Address of your ntfy server, as you open its web app.'),
      placeHolder: 'https://ntfy.example.com',
      ignoreFocusOut: true,
      validateInput: serverProblem,
    });
    if (typed === undefined) return;
    server = normalizeServer(typed);
  }

  const topic = await vscode.window.showInputBox({
    title: title(own ? 2 : 1),
    prompt: vscode.l10n.t(
      'Topic to publish to; subscribe to the same topic in the ntfy app on your phone. On a public server anyone who knows it can read it, so keep the random suggestion or choose something as hard to guess.',
    ),
    value: suggestTopic(),
    ignoreFocusOut: true,
    validateInput: (value) =>
      topicProblem(value) ??
      (currentDestinations().entries.some(
        (entry) => entry.key === destinationKey({ server, topic: value }),
      )
        ? vscode.l10n.t('This topic on this server is already in the list.')
        : undefined),
  });
  if (topic === undefined) return;

  let token = '';
  if (own) {
    const saved = (await services.secrets.get(tokenKey(server))) !== undefined;
    const typed = await vscode.window.showInputBox({
      title: title(3),
      prompt: saved
        ? vscode.l10n.t('Access token for your server. Leave this empty to keep the saved token.')
        : vscode.l10n.t(
            'Access token for your server, if the topic needs one. Leave this empty if it does not.',
          ),
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => (value.trim() === '' ? undefined : tokenProblem(value)),
    });
    if (typed === undefined) return;
    token = typed;
  }

  const first = currentDestinations().entries.length === 0;
  const saved = await saveDestination(services.secrets, { name: '', server, topic, token });
  if (!saved.ok) {
    offer('error', vscode.l10n.t('This topic on this server is already in the list.'));
    return;
  }
  // A first setup is the moment to offer Claude Code, when it is on this computer.
  const claude = services.claude.status();
  await sendTest(
    services,
    saved.key,
    first && claude.found && claude.hooks === 'disconnected'
      ? { title: vscode.l10n.t('Connect Claude Code'), command: 'nightping.connectClaudeCode' }
      : undefined,
  );
}

/**
 * To every destination that is on, or with `key` to that one. With `next`, a sent test offers
 * that next step in the same message.
 */
export async function sendTest(services: Services, key?: unknown, next?: Action): Promise<void> {
  const outcome = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: vscode.l10n.t('Sending a test notification…'),
    },
    () =>
      services.sender.send(testMessage(vscode.l10n.t), typeof key === 'string' ? key : undefined),
  );
  // Short on purpose: a collapsed toast shows one line, and the topic is in the status bar tooltip.
  report(outcome, vscode.l10n.t('Test notification sent. Check your phone.'), next);
}

/** Saves the token of a server; without `server`, asks which, if there is more than one. */
export async function setToken(services: Services, server?: unknown): Promise<void> {
  const target = await pickServer(server, vscode.l10n.t('Set Access Token'));
  if (target === undefined) return;
  const token = await vscode.window.showInputBox({
    title: vscode.l10n.t('Access Token for {0}', hostOf(target)),
    prompt: vscode.l10n.t(
      'Access token for your ntfy server. It is kept in the secret storage of VS Code on this computer.',
    ),
    password: true,
    ignoreFocusOut: true,
    validateInput: tokenProblem,
  });
  if (token === undefined) return;
  await services.secrets.store(tokenKey(target), token.trim());
  offer('info', vscode.l10n.t('Access token saved.'), sendTestAction());
}

export async function clearToken(services: Services, server?: unknown): Promise<void> {
  const target = await pickServer(server, vscode.l10n.t('Clear Access Token'));
  if (target === undefined) return;
  const saved = (await services.secrets.get(tokenKey(target))) !== undefined;
  await services.secrets.delete(tokenKey(target));
  void vscode.window.showInformationMessage(
    saved ? vscode.l10n.t('Access token removed.') : vscode.l10n.t('No access token was saved.'),
  );
}

/**
 * Removes a destination after asking; without `key`, asks which. The panel's Remove comes here
 * too, so both ask the same way.
 */
export async function remove(services: Services, key?: unknown): Promise<void> {
  const { entries } = currentDestinations();
  let entry = entries.find((item) => item.key === key);
  if (!entry) {
    if (entries.length === 0) {
      offer('info', notReadyText(vscode.l10n.t, 'incomplete'), setUpAction());
      return;
    }
    const choice = await vscode.window.showQuickPick(
      entries.map((item) => ({
        label: displayName(item),
        description: vscode.l10n.t('Topic {0} on {1}', item.topic, hostOf(item.server)),
        entry: item,
      })),
      { title: vscode.l10n.t('Remove a Destination') },
    );
    if (!choice) return;
    entry = choice.entry;
  }
  const yes = vscode.l10n.t('Remove');
  const answer = await vscode.window.showWarningMessage(
    vscode.l10n.t('Remove {0}?', displayName(entry)),
    {
      modal: true,
      detail: vscode.l10n.t(
        'Notifications stop going to the topic {0} on {1}.',
        entry.topic,
        entry.server,
      ),
    },
    yes,
  );
  if (answer === yes) await removeDestination(services.secrets, entry.key);
}

/** The server passed, or the one of the destinations, or the one the user picks. */
async function pickServer(server: unknown, title: string): Promise<string | undefined> {
  if (typeof server === 'string' && isServerUrl(normalizeServer(server))) {
    return normalizeServer(server);
  }
  const servers = [
    ...new Set(
      currentDestinations()
        .entries.filter((entry) => entry.problem !== 'server')
        .map((entry) => entry.server),
    ),
  ];
  if (servers.length === 0) {
    offer('warning', notReadyText(vscode.l10n.t, 'incomplete'), setUpAction());
    return undefined;
  }
  if (servers.length === 1) return servers[0];
  const choice = await vscode.window.showQuickPick(
    servers.map((item) => ({ label: hostOf(item), description: item, server: item })),
    { title, placeHolder: vscode.l10n.t('A token belongs to a server.') },
  );
  return choice?.server;
}

function serverProblem(value: string): string | undefined {
  const server = normalizeServer(value);
  if (server === '') {
    return vscode.l10n.t('Enter the address of your ntfy server.');
  }
  return isServerUrl(server)
    ? undefined
    : vscode.l10n.t(
        'Enter an http:// or https:// address such as https://ntfy.sh, without a user name, password, ? or #.',
      );
}

function topicProblem(value: string): string | undefined {
  return isTopic(value.trim())
    ? undefined
    : vscode.l10n.t('Use only letters, numbers, - and _, up to 64 characters.');
}

function tokenProblem(value: string): string | undefined {
  const token = value.trim();
  if (token === '') {
    return vscode.l10n.t('Enter the token, or use “Nightping: Clear Access Token” to remove it.');
  }
  return isToken(token)
    ? undefined
    : vscode.l10n.t('An access token has no spaces or special characters.');
}

/** Tells how a send the user started went; `sent` is the line for success. */
function report(outcome: SendOutcome, sent: string, next?: Action): void {
  switch (outcome.kind) {
    case 'not-ready':
      offer(
        'warning',
        notReadyText(vscode.l10n.t, outcome.state),
        outcome.state === 'incomplete' ? setUpAction() : openAction(),
      );
      return;
    case 'sent':
      offer('info', sent, ...(next ? [next] : []));
      return;
    case 'failed': {
      const { failures } = outcome;
      const total = failures.length + outcome.sent;
      // A toast keeps to one line.
      const text = outcome.text.replace(/\n/g, ' ');
      if (outcome.sent > 0) {
        offer(
          'warning',
          `${vscode.l10n.t('Sent to {0} of {1} destinations.', outcome.sent, total)} ${text}`,
          openAction(),
        );
        return;
      }
      if (failures.length > 1) {
        offer('error', text, openAction());
        return;
      }
      const { result, hasToken, destination } = failures[0];
      const actions =
        result.reason === 'unauthorized'
          ? hasToken
            ? [setTokenAction(destination.server), clearTokenAction(destination.server)]
            : [setTokenAction(destination.server)]
          : result.reason === 'redirect' || result.reason === 'unreachable'
            ? [openAction()]
            : [];
      offer('error', text, ...actions);
      return;
    }
  }
}

/** Shows a message without waiting for it, and runs the command of the button the user picks. */
function offer(
  severity: 'info' | 'warning' | 'error',
  message: string,
  ...actions: Action[]
): void {
  const show =
    severity === 'error'
      ? vscode.window.showErrorMessage
      : severity === 'warning'
        ? vscode.window.showWarningMessage
        : vscode.window.showInformationMessage;
  void show(message, ...actions.map((action) => action.title)).then((choice) => {
    const action = actions.find((candidate) => candidate.title === choice);
    if (action) {
      void vscode.commands.executeCommand(action.command, ...(action.args ?? []));
    }
  });
}
