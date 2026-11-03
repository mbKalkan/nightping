import * as vscode from 'vscode';
import {
  isServerUrl,
  isTopic,
  normalizeServer,
  readDestination,
  suggestTopic,
  type Destination,
  type DestinationState,
} from './config';
import { publish, type PublishResult } from './ntfy';

/** SecretStorage key; secrets are already kept apart per extension. */
const TOKEN = 'accessToken';

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

function settings(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('nightping');
}

export function currentDestination(): DestinationState {
  const values = settings();
  return readDestination((key) => values.get(key));
}

/** Asks for the server, topic and token, saves them, then sends a test notification. */
export async function setUp(secrets: vscode.SecretStorage): Promise<void> {
  const values = settings();
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

  const saved = (await secrets.get(TOKEN)) !== undefined;
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

  await values.update('server', normalizeServer(server), vscode.ConfigurationTarget.Global);
  await values.update('topic', topic.trim(), vscode.ConfigurationTarget.Global);
  if (token.trim() !== '') {
    await secrets.store(TOKEN, token.trim());
  }
  await sendTest(secrets);
}

export async function sendTest(secrets: vscode.SecretStorage): Promise<void> {
  const state = currentDestination();
  if (state.kind !== 'ready') {
    offer(
      'warning',
      state.kind === 'incomplete'
        ? vscode.l10n.t('Nightping is not set up yet.')
        : vscode.l10n.t('The ntfy server or topic in the settings is not valid.'),
      setUpAction(),
    );
    return;
  }
  const token = await secrets.get(TOKEN);
  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: vscode.l10n.t('Sending a test notification…'),
    },
    () =>
      publish(
        state.destination,
        {
          title: vscode.l10n.t('Nightping test'),
          message: vscode.l10n.t('Notifications from VS Code will arrive like this.'),
          tags: ['bell'],
        },
        { token },
      ),
  );
  report(result, state.destination, token !== undefined);
}

export async function setToken(secrets: vscode.SecretStorage): Promise<void> {
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
  await secrets.store(TOKEN, token.trim());
  offer('info', vscode.l10n.t('Access token saved.'), sendTestAction());
}

export async function clearToken(secrets: vscode.SecretStorage): Promise<void> {
  const saved = (await secrets.get(TOKEN)) !== undefined;
  await secrets.delete(TOKEN);
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
  // Anything else cannot go into an HTTP header.
  return /^[\x21-\x7e]+$/.test(token)
    ? undefined
    : vscode.l10n.t('An access token has no spaces or special characters.');
}

function report(result: PublishResult, destination: Destination, hasToken: boolean): void {
  const { server } = destination;
  if (result.ok) {
    // Short on purpose: a collapsed toast shows one line, and the topic is in the status bar tooltip.
    void vscode.window.showInformationMessage(
      vscode.l10n.t('Test notification sent. Check your phone.'),
    );
    return;
  }
  switch (result.reason) {
    case 'unauthorized':
      if (hasToken) {
        offer(
          'error',
          vscode.l10n.t('{0} refused the access token (HTTP {1}).', server, result.status),
          setTokenAction(),
          clearTokenAction(),
        );
      } else {
        offer(
          'error',
          vscode.l10n.t(
            '{0} needs an access token for this topic (HTTP {1}).',
            server,
            result.status,
          ),
          setTokenAction(),
        );
      }
      return;
    case 'redirect':
      offer(
        'error',
        vscode.l10n.t(
          '{0} redirects to {1}. Use that address as the server.',
          server,
          result.location,
        ),
        setUpAction(),
      );
      return;
    case 'http':
      offer(
        'error',
        result.detail
          ? vscode.l10n.t('{0} answered HTTP {1}: {2}', server, result.status, result.detail)
          : vscode.l10n.t('{0} answered HTTP {1}.', server, result.status),
      );
      return;
    case 'unreachable':
      offer(
        'error',
        vscode.l10n.t('Could not reach {0} ({1}).', server, result.detail),
        setUpAction(),
      );
      return;
    case 'timeout':
      offer(
        'error',
        vscode.l10n.t('{0} did not answer within {1} seconds.', server, result.seconds),
      );
      return;
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
