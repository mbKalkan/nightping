import { createServer, type IncomingHttpHeaders, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { publish } from '../../src/extension/ntfy';

interface Request {
  method: string | undefined;
  url: string | undefined;
  headers: IncomingHttpHeaders;
  body: string;
}

const servers: { close(): Promise<void> }[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

/** A local stand-in for ntfy that records each request and answers with `reply`. */
async function fakeNtfy(reply: (response: ServerResponse) => void) {
  const requests: Request[] = [];
  const http = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => (body += chunk));
    request.on('end', () => {
      requests.push({ method: request.method, url: request.url, headers: request.headers, body });
      reply(response);
    });
  });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const { port } = http.address() as AddressInfo;
  const fake = {
    server: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        http.closeAllConnections();
        http.close(() => resolve());
      }),
  };
  servers.push(fake);
  return fake;
}

const json =
  (status: number, body: unknown, headers: Record<string, string> = {}) =>
  (response: ServerResponse) => {
    response.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    response.end(JSON.stringify(body));
  };

const ok = json(200, { id: 'abc123', event: 'message' });
const test = { title: 'Nightping test', message: 'It works' };

describe('publish', () => {
  it('posts the message as JSON to the root of the server, with the topic in the body', async () => {
    const ntfy = await fakeNtfy(ok);
    const message = {
      title: 'Build failed',
      message: 'npm test · 4m 12s',
      tags: ['x'],
      priority: 4 as const,
    };
    await expect(publish({ server: ntfy.server, topic: 'alerts' }, message)).resolves.toEqual({
      ok: true,
    });
    expect(ntfy.requests).toHaveLength(1);
    const [request] = ntfy.requests;
    expect(request.method).toBe('POST');
    expect(request.url).toBe('/');
    expect(request.headers['content-type']).toBe('application/json');
    expect(request.headers.authorization).toBeUndefined();
    expect(JSON.parse(request.body)).toEqual({ topic: 'alerts', ...message });
  });

  it('posts to the root of a server that lives under a path', async () => {
    const ntfy = await fakeNtfy(ok);
    await publish({ server: `${ntfy.server}/ntfy`, topic: 'alerts' }, test);
    expect(ntfy.requests[0].url).toBe('/ntfy/');
  });

  it('sends the access token as a bearer token', async () => {
    const ntfy = await fakeNtfy(ok);
    await publish({ server: ntfy.server, topic: 'alerts' }, test, { token: 'tk_abc123' });
    expect(ntfy.requests[0].headers.authorization).toBe('Bearer tk_abc123');
  });

  it('keeps non-ASCII text intact', async () => {
    const ntfy = await fakeNtfy(ok);
    const message = { title: 'Claude · ağaç', message: 'İzin bekliyor 🔔' };
    await publish({ server: ntfy.server, topic: 'alerts' }, message);
    expect(JSON.parse(ntfy.requests[0].body)).toMatchObject(message);
  });

  it('reports a missing or refused token', async () => {
    for (const status of [401, 403]) {
      const ntfy = await fakeNtfy(
        json(status, { code: 40101, http: status, error: 'unauthorized' }),
      );
      await expect(publish({ server: ntfy.server, topic: 'alerts' }, test)).resolves.toEqual({
        ok: false,
        reason: 'unauthorized',
        status,
      });
    }
  });

  it('reports a redirect instead of following it', async () => {
    const ntfy = await fakeNtfy(json(301, {}, { Location: 'https://ntfy.example.com/' }));
    await expect(
      publish({ server: ntfy.server, topic: 'alerts' }, test, { token: 'tk_abc123' }),
    ).resolves.toEqual({
      ok: false,
      reason: 'redirect',
      status: 301,
      location: 'https://ntfy.example.com/',
    });
    expect(ntfy.requests).toHaveLength(1);
  });

  it('resolves a relative redirect against the server', async () => {
    const ntfy = await fakeNtfy(json(308, {}, { Location: '/ntfy/' }));
    await expect(publish({ server: ntfy.server, topic: 'alerts' }, test)).resolves.toMatchObject({
      reason: 'redirect',
      location: `${ntfy.server}/ntfy/`,
    });
  });

  it('passes on the error that ntfy gives, and only that', async () => {
    const limited = await fakeNtfy(
      json(429, { code: 42901, http: 429, error: 'limit reached: too many requests' }),
    );
    await expect(publish({ server: limited.server, topic: 'alerts' }, test)).resolves.toEqual({
      ok: false,
      reason: 'http',
      status: 429,
      detail: 'limit reached: too many requests',
    });

    const proxy = await fakeNtfy((response) => {
      response.writeHead(502, { 'Content-Type': 'text/html' });
      response.end('<html><body>Bad Gateway</body></html>');
    });
    await expect(publish({ server: proxy.server, topic: 'alerts' }, test)).resolves.toEqual({
      ok: false,
      reason: 'http',
      status: 502,
      detail: '',
    });
  });

  it('shortens a long error to one line', async () => {
    const ntfy = await fakeNtfy(json(400, { error: `bad\nrequest ${'x'.repeat(500)}` }));
    const result = await publish({ server: ntfy.server, topic: 'alerts' }, test);
    expect(result).toMatchObject({ reason: 'http', status: 400 });
    const { detail } = result as { detail: string };
    expect(detail).toHaveLength(200);
    expect(detail.startsWith('bad request x')).toBe(true);
    expect(detail.endsWith('…')).toBe(true);
  });

  it('reports a server that cannot be reached', async () => {
    const ntfy = await fakeNtfy(ok);
    await ntfy.close();
    await expect(publish({ server: ntfy.server, topic: 'alerts' }, test)).resolves.toEqual({
      ok: false,
      reason: 'unreachable',
      detail: 'ECONNREFUSED',
    });
  });

  it('gives up on a server that does not answer', async () => {
    const ntfy = await fakeNtfy(() => {});
    await expect(
      publish({ server: ntfy.server, topic: 'alerts' }, test, { timeoutMs: 200 }),
    ).resolves.toEqual({ ok: false, reason: 'timeout', seconds: 0.2 });
  });
});
