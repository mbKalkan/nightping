import { describe, expect, it } from 'vitest';
import { readDestinations } from '../../src/extension/config';
import { deliver, deliveryError } from '../../src/extension/delivery';
import type { PublishResult } from '../../src/extension/ntfy';
import type { Translate } from '../../src/extension/texts';

const english: Translate = (text, ...args) =>
  text.replace(/\{(\d+)\}/g, (_, index: string) => String(args[Number(index)]));

const message = { title: 'Build', message: 'failed · 4m 12s' };

const destinations = readDestinations([
  { name: 'Phone', server: 'https://ntfy.sh', topic: 'a' },
  { server: 'https://ntfy.example.com', topic: 'b' },
]).entries;

describe('deliver', () => {
  it('sends to every destination at the same time, each with its server’s token', async () => {
    const started: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const tokens: Record<string, string> = { 'https://ntfy.example.com': 'tk_example' };
    const seen: Array<{ server: string; topic: string; token?: string }> = [];
    const delivery = deliver(
      english,
      destinations,
      message,
      (server) => Promise.resolve(tokens[server]),
      async (target, _message, options) => {
        started.push(target.topic);
        seen.push({ server: target.server, topic: target.topic, token: options.token });
        // Both have started before either answers.
        if (started.length === destinations.length) release();
        await gate;
        return { ok: true };
      },
    );
    const result = await delivery;
    expect(started).toEqual(['a', 'b']);
    expect(seen).toEqual([
      { server: 'https://ntfy.sh', topic: 'a', token: undefined },
      { server: 'https://ntfy.example.com', topic: 'b', token: 'tk_example' },
    ]);
    expect(result.sent.map((entry) => entry.topic)).toEqual(['a', 'b']);
    expect(deliveryError(result)).toBeUndefined();
  });

  it('sends to ntfy on this computer when the server is this computer, with the server’s token', async () => {
    const desk = 'https://desk.tail1234.ts.net';
    const targets = readDestinations([
      { server: desk, topic: 'a' },
      { server: 'https://ntfy.sh', topic: 'b' },
    ]).entries;
    const seen: Array<{ server: string; token?: string }> = [];
    const result = await deliver(
      english,
      targets,
      message,
      (server) => Promise.resolve(server === desk ? 'tk_desk' : undefined),
      (target, _message, options) => {
        seen.push({ server: target.server, token: options.token });
        return Promise.resolve<PublishResult>(
          target.topic === 'a'
            ? { ok: false, reason: 'unreachable', detail: 'ECONNREFUSED' }
            : { ok: true },
        );
      },
      new Map([[desk, 'http://127.0.0.1:2586']]),
    );
    expect(seen).toEqual([
      { server: 'http://127.0.0.1:2586', token: 'tk_desk' },
      { server: 'https://ntfy.sh', token: undefined },
    ]);
    // The list still names the destination by its own address.
    expect(result.failures[0].destination.server).toBe(desk);
    expect(deliveryError(result)).toBe(
      'desk.tail1234.ts.net: Could not reach ntfy on this computer at http://127.0.0.1:2586 (ECONNREFUSED).',
    );
  });

  it('names each destination that did not get it', async () => {
    const results: Record<string, PublishResult> = {
      a: { ok: true },
      b: { ok: false, reason: 'unreachable', detail: 'ENOTFOUND' },
    };
    const result = await deliver(
      english,
      destinations,
      message,
      () => Promise.resolve(undefined),
      (target) => Promise.resolve(results[target.topic]),
    );
    expect(result.sent).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({ hasToken: false, result: results.b });
    expect(deliveryError(result)).toBe(
      'ntfy.example.com: Could not reach https://ntfy.example.com (ENOTFOUND).',
    );
  });

  it('says the reason alone when there is one destination', async () => {
    const result = await deliver(
      english,
      destinations.slice(0, 1),
      message,
      () => Promise.resolve('tk_wrong'),
      () => Promise.resolve({ ok: false, reason: 'unauthorized', status: 401 }),
    );
    expect(deliveryError(result)).toBe('https://ntfy.sh refused the access token (HTTP 401).');
  });

  it('puts one reason on each line', async () => {
    const result = await deliver(
      english,
      destinations,
      message,
      () => Promise.resolve(undefined),
      () => Promise.resolve({ ok: false, reason: 'timeout', seconds: 10 }),
    );
    expect(deliveryError(result)?.split('\n')).toEqual([
      'Phone: https://ntfy.sh did not answer within 10 seconds.',
      'ntfy.example.com: https://ntfy.example.com did not answer within 10 seconds.',
    ]);
  });
});
