// The endpoint on a real socket, as agents' hooks reach it.
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  Endpoint,
  AGENT_PATHS,
  STATUS_PATH,
  type Agent,
  type EndpointState,
} from '../../src/extension/endpoint';

const HOOK_PATH = AGENT_PATHS.claude;

const running: Endpoint[] = [];
afterEach(() => {
  for (const endpoint of running.splice(0)) endpoint.stop();
});

/** A port that was free a moment ago. */
async function freePort(): Promise<number> {
  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function start(retryMs = 50) {
  const payloads: unknown[] = [];
  const agents: Agent[] = [];
  const states: EndpointState[] = [];
  const endpoint = new Endpoint(
    (agent, payload) => {
      agents.push(agent);
      payloads.push(payload);
    },
    (state) => states.push(state),
    retryMs,
  );
  running.push(endpoint);
  return { endpoint, payloads, agents, states };
}

async function until(check: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** A raw request, so the Host header can be anything. */
function send(
  port: number,
  options: { method?: string; path?: string; host?: string; type?: string; body?: string },
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: '127.0.0.1',
        port,
        method: options.method ?? 'POST',
        path: options.path ?? HOOK_PATH,
        headers: {
          host: options.host ?? `127.0.0.1:${port}`,
          ...(options.type === undefined ? {} : { 'content-type': options.type }),
        },
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => (body += chunk));
        response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
      },
    );
    request.on('error', reject);
    request.end(options.body);
  });
}

describe('Endpoint', () => {
  it('takes a JSON post and answers with an empty success, so Claude goes on', async () => {
    const port = await freePort();
    const { endpoint, payloads } = await start();
    endpoint.start(port);
    await until(() => endpoint.state.kind === 'listening');
    const answer = await send(port, {
      type: 'application/json',
      body: '{"hook_event_name":"Stop"}',
    });
    expect(answer).toEqual({ status: 204, body: '' });
    expect(payloads).toEqual([{ hook_event_name: 'Stop' }]);
  });

  it('tells which agent posted, by its path', async () => {
    const port = await freePort();
    const { endpoint, agents } = await start();
    endpoint.start(port);
    await until(() => endpoint.state.kind === 'listening');
    const json = { type: 'application/json', body: '{}' };
    expect((await send(port, { ...json, path: AGENT_PATHS.codex })).status).toBe(204);
    expect((await send(port, { ...json, path: AGENT_PATHS.claude })).status).toBe(204);
    expect((await send(port, { ...json, path: AGENT_PATHS.copilot })).status).toBe(204);
    expect(agents).toEqual(['codex', 'claude', 'copilot']);
  });

  it('listens while at least one agent is connected', async () => {
    const port = await freePort();
    const { endpoint } = await start();
    endpoint.need('claude', port);
    endpoint.need('codex', port);
    await until(() => endpoint.state.kind === 'listening');
    endpoint.need('claude', undefined);
    expect(endpoint.state.kind).toBe('listening');
    endpoint.need('codex', undefined);
    expect(endpoint.state.kind).toBe('off');
  });

  it('refuses what Claude Code does not send', async () => {
    const port = await freePort();
    const { endpoint, payloads } = await start();
    endpoint.start(port);
    await until(() => endpoint.state.kind === 'listening');
    const json = { type: 'application/json', body: '{}' };
    // Another host name: a web page that rebinds a name to 127.0.0.1.
    expect((await send(port, { ...json, host: `evil.example:${port}` })).status).toBe(403);
    expect((await send(port, { ...json, path: '/other' })).status).toBe(404);
    expect((await send(port, { ...json, method: 'PUT' })).status).toBe(405);
    // A page can post text/plain without asking first; JSON needs a preflight nobody answers.
    expect((await send(port, { type: 'text/plain', body: '{}' })).status).toBe(415);
    expect((await send(port, { type: 'application/json', body: '{oops' })).status).toBe(400);
    expect(
      (await send(port, { type: 'application/json', body: `"${'x'.repeat(1_100_000)}"` })).status,
    ).toBe(413);
    expect(payloads).toEqual([]);
    expect(await send(port, { method: 'GET', path: STATUS_PATH })).toEqual({
      status: 200,
      body: '{"app":"nightping"}',
    });
  });

  it('lets one window hold the port, and another take over when it stops', async () => {
    const port = await freePort();
    const first = await start();
    const second = await start();
    first.endpoint.start(port);
    await until(() => first.endpoint.state.kind === 'listening');
    second.endpoint.start(port);
    await until(() => second.endpoint.state.kind === 'other-window');
    first.endpoint.stop();
    await until(() => second.endpoint.state.kind === 'listening');
    expect(second.states.map((state) => state.kind)).toEqual(['other-window', 'listening']);
  });

  it('says when another program holds the port', async () => {
    const port = await freePort();
    const other = http.createServer((_, response) => response.end('hello'));
    await new Promise<void>((resolve) => other.listen(port, '127.0.0.1', resolve));
    try {
      const { endpoint } = await start();
      endpoint.start(port);
      await until(() => endpoint.state.kind === 'other-program');
      endpoint.stop();
      expect(endpoint.state.kind).toBe('off');
    } finally {
      await new Promise((resolve) => other.close(resolve));
    }
  });
});
