import { describe, expect, it } from 'vitest';
import { failureText, panelStrings, type Translate } from '../../src/extension/texts';

const english: Translate = (message, ...args) =>
  message.replace(/\{(\d+)\}/g, (_, index: string) => String(args[Number(index)]));

const server = 'https://ntfy.example.com';

describe('failureText', () => {
  it('names the token problem, depending on whether a token is saved', () => {
    const result = { ok: false, reason: 'unauthorized', status: 403 } as const;
    expect(failureText(english, result, server, false)).toBe(
      'https://ntfy.example.com needs an access token for this topic (HTTP 403).',
    );
    expect(failureText(english, result, server, true)).toBe(
      'https://ntfy.example.com refused the access token (HTTP 403).',
    );
  });

  it('says where a redirect goes', () => {
    expect(
      failureText(
        english,
        { ok: false, reason: 'redirect', status: 301, location: 'https://ntfy.example.com/' },
        'http://ntfy.example.com',
        false,
      ),
    ).toBe(
      'http://ntfy.example.com redirects to https://ntfy.example.com/. Use that address as the server.',
    );
  });

  it('passes on what ntfy said, when it said something', () => {
    expect(
      failureText(
        english,
        { ok: false, reason: 'http', status: 429, detail: 'limit reached' },
        server,
        false,
      ),
    ).toBe('https://ntfy.example.com answered HTTP 429: limit reached');
    expect(
      failureText(english, { ok: false, reason: 'http', status: 502, detail: '' }, server, false),
    ).toBe('https://ntfy.example.com answered HTTP 502.');
  });

  it('explains unreachable and silent servers', () => {
    expect(
      failureText(
        english,
        { ok: false, reason: 'unreachable', detail: 'ENOTFOUND' },
        server,
        false,
      ),
    ).toBe('Could not reach https://ntfy.example.com (ENOTFOUND).');
    expect(failureText(english, { ok: false, reason: 'timeout', seconds: 10 }, server, false)).toBe(
      'https://ntfy.example.com did not answer within 10 seconds.',
    );
  });
});

describe('panelStrings', () => {
  it('leaves the time placeholder for the panel to fill', () => {
    expect(panelStrings(english).sentAt).toBe('Sent at {0}. Check your phone.');
  });
});
