// The local endpoint that AI agents' hooks post to, each to its own path. It listens on 127.0.0.1
// only, takes only JSON posts of limited size, and answers at once so that an agent never waits.
// One VS Code window holds the port; the others retry every 2 seconds and take over when it
// closes. No VS Code here, so tests run it on a real socket.
import * as http from 'node:http';

/** Where each agent's hooks post. */
export const AGENT_PATHS = {
  claude: '/nightping/claude-code',
  codex: '/nightping/codex',
  copilot: '/nightping/copilot',
} as const;
export type Agent = keyof typeof AGENT_PATHS;
export const STATUS_PATH = '/nightping/status';
const BODY_LIMIT = 1024 * 1024;
export const RETRY_MS = 2000;

export type EndpointState =
  | { kind: 'off' }
  | { kind: 'listening'; port: number }
  /** Another VS Code window with Nightping holds the port: it gets the events. */
  | { kind: 'other-window'; port: number }
  /** Some other program holds the port. */
  | { kind: 'other-program'; port: number };

export class Endpoint {
  private server: http.Server | undefined;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private port: number | undefined;
  private current: EndpointState = { kind: 'off' };
  /** The agents connected to Nightping, and the port their hooks use. */
  private readonly needs = new Map<Agent, number>();

  constructor(
    private readonly onPayload: (agent: Agent, payload: unknown) => void,
    private readonly onState: (state: EndpointState) => void = () => {},
    private readonly retryMs = RETRY_MS,
  ) {}

  get state(): EndpointState {
    return this.current;
  }

  /** Listens while at least one agent's hooks are connected; `undefined` when they are not. */
  need(agent: Agent, port: number | undefined): void {
    if (port === undefined) this.needs.delete(agent);
    else this.needs.set(agent, port);
    // Every agent reads the same port setting, so they agree on the port.
    const [wanted] = this.needs.values();
    if (wanted === undefined) this.stop();
    else this.start(wanted);
  }

  /** Listens on `port`, or keeps trying while another program or window holds it. */
  start(port: number): void {
    if (this.port === port && this.current.kind !== 'off') return;
    this.stop();
    this.port = port;
    this.listen();
  }

  stop(): void {
    clearTimeout(this.retry);
    this.retry = undefined;
    this.port = undefined;
    const server = this.server;
    this.server = undefined;
    if (server) {
      server.closeAllConnections();
      server.close();
    }
    this.set({ kind: 'off' });
  }

  private listen(): void {
    const port = this.port;
    if (port === undefined) return;
    const server = http.createServer((request, response) => this.handle(request, response, port));
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (this.port !== port) return;
      this.server = undefined;
      if (error.code !== 'EADDRINUSE') {
        this.set({ kind: 'other-program', port });
      } else {
        void holder(port).then((byNightping) => {
          if (this.port === port && !this.server) {
            this.set({ kind: byNightping ? 'other-window' : 'other-program', port });
          }
        });
      }
      this.retry = setTimeout(() => this.listen(), this.retryMs);
    });
    server.listen(port, '127.0.0.1', () => {
      if (this.port !== port) {
        server.close();
        return;
      }
      this.set({ kind: 'listening', port });
    });
    this.server = server;
  }

  private handle(request: http.IncomingMessage, response: http.ServerResponse, port: number): void {
    const answer = (status: number, body?: string) => {
      response.writeHead(status, body === undefined ? {} : { 'Content-Type': 'application/json' });
      response.end(body);
    };
    // A web page can reach 127.0.0.1 too; a page under another name (DNS rebinding) cannot pass
    // this Host check, and it cannot send JSON without a preflight that is never answered.
    if (
      request.headers.host !== `127.0.0.1:${port}` &&
      request.headers.host !== `localhost:${port}`
    ) {
      answer(403);
      return;
    }
    if (request.method === 'GET' && request.url === STATUS_PATH) {
      answer(200, '{"app":"nightping"}');
      return;
    }
    const agent = (Object.keys(AGENT_PATHS) as Agent[]).find(
      (name) => AGENT_PATHS[name] === request.url,
    );
    if (agent === undefined) {
      answer(404);
      return;
    }
    if (request.method !== 'POST') {
      answer(405);
      return;
    }
    if (!/^application\/json\b/i.test(request.headers['content-type'] ?? '')) {
      answer(415);
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    // Past the limit the rest is read and dropped, so that the sender still gets the answer.
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size <= BODY_LIMIT) chunks.push(chunk);
    });
    request.on('end', () => {
      if (size > BODY_LIMIT) {
        answer(413);
        return;
      }
      let payload: unknown;
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        answer(400);
        return;
      }
      // No body: a JSON answer could tell an agent to block or keep working. An empty success
      // lets it go on as if there were no hook.
      answer(204);
      this.onPayload(agent, payload);
    });
  }

  private set(state: EndpointState): void {
    const same =
      state.kind === this.current.kind &&
      (state.kind === 'off' || (this.current.kind !== 'off' && state.port === this.current.port));
    this.current = state;
    if (!same) this.onState(state);
  }
}

/** Whether the program on `port` is Nightping in another window. */
async function holder(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}${STATUS_PATH}`, {
      signal: AbortSignal.timeout(1000),
    });
    const body = (await response.json()) as { app?: unknown };
    return body.app === 'nightping';
  } catch {
    return false;
  }
}
