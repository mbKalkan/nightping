// The command palette way to do what the panel does.
import * as vscode from 'vscode';
import type { AgentBridge } from './agentBridge';
import { isServerUrl, isToken, isTopic, normalizeServer, suggestTopic } from './config';
import { readMessage } from './message';
import { isPauseMinutes, PAUSE_MINUTES, type Pauser } from './pause';
import { saveDestination, TOKEN_KEY, type Sender, type SendOutcome } from './sender';
import { notReadyText, testMessage } from './texts';

export interface Services {
  secrets: vscode.SecretStorage;
  sender: Sender;
  pauser: Pauser;
  claude: AgentBridge;
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
}

const setUpAction = (): Action => ({ title: vscode.l10n.t('Set Up…'), command: 'nightping.setUp' });
const setTokenAction = (): Action => ({
  title: vscode.l10n.t('Set Access Token…'),
  command: 'nightping.setToken',
});
const clearTokenAction = (): Action => ({
  title: vscode.l10n.t('Clear Access Token'),
  command: 'nightping.clearToken',
});
const sendTestAction = (): Action => ({
  title: vscode.l10n.t('Send Test Notification'),
  command: 'nightping.sendTest',
});

/** Asks for the server, topic and token, saves them, then sends a test notification. */
export async function setUp(services: Services): Promise<void> {
  const values = vscode.workspace.getConfiguration('nightping');
  const title = (step: number) => vscode.l10n.t('Set Up Nightping ({0}/3)', step);

  const server = await vscode.window.showInputBox({
    title: title(1),
    prompt: vscode.l10n.t('Address of your ntfy server: https://ntfy.sh or your own server.'),
    placeHolder: 'https://ntfy.sh',
    value: values.get<string>('server') ?? '',
    ignoreFocusOut: true,
    validateInput: serverProblem,
  });
  if (server === undefined) {
    return;
  }

  const topic = await vscode.window.showInputBox({
    title: title(2),
    prompt: vscode.l10n.t(
      'Topic to publish to; subscribe to the same topic in the ntfy app on your phone. On a public server anyone who knows it can read it, so keep the random suggestion or choose something as hard to guess.',
    ),
    value: values.get<string>('topic')?.trim() || suggestTopic(),
    ignoreFocusOut: true,
    validateInput: topicProblem,
  });
  if (topic === undefined) {
    return;
  }

  const saved = (await services.secrets.get(TOKEN_KEY)) !== undefined;
  const token = await vscode.window.showInputBox({
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
  if (token === undefined) {
    return;
  }

  await saveDestination(services.secrets, server, topic, token);
  // A first setup is the moment to offer Claude Code, when it is on this computer.
  const claude = services.claude.status();
  await sendTest(
    services,
    claude.found && claude.hooks === 'disconnected'
      ? { title: vscode.l10n.t('Connect Claude Code'), command: 'nightping.connectClaudeCode' }
      : undefined,
  );
}

/** With `next`, a sent test offers that next step in the same message. */
export async function sendTest(services: Services, next?: Action): Promise<void> {
  const outcome = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: vscode.l10n.t('Sending a test notification…'),
    },
    () => services.sender.send(testMessage(vscode.l10n.t)),
  );
  // Short on purpose: a collapsed toast shows one line, and the topic is in the status bar tooltip.
  report(outcome, vscode.l10n.t('Test notification sent. Check your phone.'), next);
}

export async function setToken(services: Services): Promise<void> {
  const token = await vscode.window.showInputBox({
    title: vscode.l10n.t('Nightping Access Token'),
    prompt: vscode.l10n.t(
      'Access token for your ntfy server. It is kept in the secret storage of VS Code on this computer.',
    ),
    password: true,
    ignoreFocusOut: true,
    validateInput: tokenProblem,
  });
  if (token === undefined) {
    return;
  }
  await services.secrets.store(TOKEN_KEY, token.trim());
  offer('info', vscode.l10n.t('Access token saved.'), sendTestAction());
}

export async function clearToken(services: Services): Promise<void> {
  const saved = (await services.secrets.get(TOKEN_KEY)) !== undefined;
  await services.secrets.delete(TOKEN_KEY);
  void vscode.window.showInformationMessage(
    saved ? vscode.l10n.t('Access token removed.') : vscode.l10n.t('No access token was saved.'),
  );
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
      offer('warning', notReadyText(vscode.l10n.t, outcome.state.kind), setUpAction());
      return;
    case 'sent':
      offer('info', sent, ...(next ? [next] : []));
      return;
    case 'failed': {
      const { result, hasToken, text } = outcome;
      const actions =
        result.reason === 'unauthorized'
          ? hasToken
            ? [setTokenAction(), clearTokenAction()]
            : [setTokenAction()]
          : result.reason === 'redirect' || result.reason === 'unreachable'
            ? [setUpAction()]
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
      void vscode.commands.executeCommand(action.command);
    }
  });
}
