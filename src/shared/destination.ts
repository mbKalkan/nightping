// Rules for the server and topic, shared by the extension and the panel so both say the same.

// ntfy's own rule for topic names.
const TOPIC = /^[-_A-Za-z0-9]{1,64}$/;

/** Trims spaces and trailing slashes, the form the setting is stored and used in. */
export function normalizeServer(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export function isServerUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    (url.protocol === 'https:' || url.protocol === 'http:') &&
    url.hostname !== '' &&
    url.username === '' &&
    url.password === '' &&
    url.search === '' &&
    url.hash === ''
  );
}

export function isTopic(value: string): boolean {
  return TOPIC.test(value);
}

/** What an HTTP header can carry: visible ASCII, no spaces. */
export function isToken(value: string): boolean {
  return /^[\x21-\x7e]+$/.test(value);
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
// The largest multiple of the alphabet size below 256: higher bytes are drawn again, so every
// letter is equally likely.
const FAIR = 256 - (256 % ALPHABET.length);

/**
 * A random topic name to offer during setup. On a public server the topic works like a
 * password, so the suggestion is long enough (about 103 bits) that nobody can guess it.
 * Web Crypto, so it runs the same in the extension host and in the panel.
 */
export function suggestTopic(): string {
  let suffix = '';
  while (suffix.length < 20) {
    for (const byte of crypto.getRandomValues(new Uint8Array(24))) {
      if (byte < FAIR && suffix.length < 20) {
        suffix += ALPHABET[byte % ALPHABET.length];
      }
    }
  }
  return `nightping-${suffix}`;
}
