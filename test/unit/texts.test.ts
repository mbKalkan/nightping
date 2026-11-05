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

  it('points at Tailscale when the server has a Tailscale address', () => {
    const tailnet = 'https://server.example-tailnet.ts.net';
    const hint =
      'It is on Tailscale: check that Tailscale is connected on this computer and that the server computer is on.';
    expect(
      failureText(
        english,
        { ok: false, reason: 'unreachable', detail: 'ENOTFOUND' },
        tailnet,
        false,
      ),
    ).toBe(`Could not reach ${tailnet} (ENOTFOUND). ${hint}`);
    expect(
      failureText(english, { ok: false, reason: 'timeout', seconds: 10 }, tailnet, false),
    ).toBe(`${tailnet} did not answer within 10 seconds. ${hint}`);
    // Its token problem is not about Tailscale.
    expect(
      failureText(english, { ok: false, reason: 'unauthorized', status: 403 }, tailnet, false),
    ).not.toContain('Tailscale');
  });

  it('names ntfy on this computer when the server is this computer', () => {
    const tailnet = 'https://server.example-tailnet.ts.net';
    const local = 'http://127.0.0.1:2586';
    expect(
      failureText(
        english,
        { ok: false, reason: 'unreachable', detail: 'ECONNREFUSED' },
        tailnet,
        false,
        local,
      ),
    ).toBe('Could not reach ntfy on this computer at http://127.0.0.1:2586 (ECONNREFUSED).');
    expect(
      failureText(english, { ok: false, reason: 'timeout', seconds: 10 }, tailnet, false, local),
    ).toBe('ntfy on this computer did not answer at http://127.0.0.1:2586 within 10 seconds.');
    // The token is the server's, so its problem names the server.
    expect(
      failureText(
        english,
        { ok: false, reason: 'unauthorized', status: 403 },
        tailnet,
        false,
        local,
      ),
    ).toBe(`${tailnet} needs an access token for this topic (HTTP 403).`);
  });
});

describe('panelStrings', () => {
  it('leaves the time placeholder for the panel to fill', () => {
    const { destinations } = panelStrings(english);
    expect(destinations.sentAt).toBe(
      'Sent at {0}. If it is not on your phone, check that the app is subscribed to the topic.',
    );
    expect(destinations.sentTo).toMatch(/^Sent to \{1\} at \{0\}\./);
    expect(destinations.topicOn).toBe('Topic {0} on {1}');
    expect(destinations.steps.topicOwn.help).toContain('{0}');
  });
});
