// User-facing text that the panel and the commands share. Every message goes through `t`:
// VS Code's `l10n.t` in the extension, a plain formatter in tests, so both show the same words.
import type { PanelStrings } from '../shared/protocol';
import type { Message, PublishResult } from './ntfy';

export type Translate = (message: string, ...args: Array<string | number>) => string;

export function panelStrings(t: Translate): PanelStrings {
  return {
    title: 'Nightping',
    tagline: t('Phone notifications through your own ntfy server.'),
    status: {
      ready: t('Ready'),
      incomplete: t('Not set up'),
      invalid: t('Check the settings'),
    },
    destination: t('Where notifications go'),
    server: t('Server'),
    serverHelp: t('Address of your ntfy server: https://ntfy.sh or your own server.'),
    serverInvalid: t(
      'Enter an http:// or https:// address such as https://ntfy.sh, without a user name, password, ? or #.',
    ),
    topic: t('Topic'),
    topicHelp: t(
      'Subscribe to the same topic in the ntfy app on your phone. On a public server anyone who knows the topic can read it, so make it hard to guess.',
    ),
    topicInvalid: t('Use only letters, numbers, - and _, up to 64 characters.'),
    randomTopic: t('Random Name'),
    token: t('Access token'),
    tokenHelp: t(
      'Only if your server asks for one. It is kept in the secret storage of VS Code on this computer, never in the settings.',
    ),
    tokenPlaceholder: t('Optional'),
    tokenSaved: t('Saved. Type a new token to replace it.'),
    tokenInvalid: t('An access token has no spaces or special characters.'),
    removeToken: t('Remove'),
    save: t('Save'),
    sendTest: t('Send Test Notification'),
    sending: t('Sending…'),
    saved: t('Saved.'),
    sentAt: t('Sent at {0}. Check your phone.', '{0}'),
    recent: t('Recent notifications'),
    recentEmpty: t('Nothing sent yet.'),
    recentNote: t('Kept on this computer only.'),
    clearRecent: t('Clear'),
    sent: t('Sent'),
    notSent: t('Not sent'),
    allSettings: t('All Settings'),
    privacy: t('Nightping sends only to the server above. No telemetry, no other network traffic.'),
  };
}

export function testMessage(t: Translate): Message {
  return {
    title: t('Nightping test'),
    message: t('Notifications from VS Code will arrive like this.'),
    tags: ['bell'],
  };
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
