// Asks the tailscale command on this computer for the user's devices, so the guide can offer one
// as the server, and for where its `tailscale serve` passes https addresses on to, so the server
// computer can send to its own ntfy. Nothing it reads leaves the computer.
import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { isOnTailscale, isServerUrl, normalizeServer } from '../shared/destination';
import type { TailscaleDevice, TailscaleView } from '../shared/protocol';

const TIMEOUT_MS = 5000;
const DEVICE_LIMIT = 100;
/** Phones and tablets do not run ntfy's server. */
const NOT_SERVERS = new Set(['android', 'ios', 'tvos']);

/** Where the command is: on the PATH first, then where each installer puts it. */
export function cliCandidates(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  switch (platform) {
    case 'win32':
      return [
        'tailscale',
        path.win32.join(env.ProgramFiles ?? 'C:\\Program Files', 'Tailscale', 'tailscale.exe'),
      ];
    case 'darwin':
      return [
        'tailscale',
        '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
        '/opt/homebrew/bin/tailscale',
        '/usr/local/bin/tailscale',
      ];
    default:
      return ['tailscale', '/usr/bin/tailscale', '/usr/local/bin/tailscale'];
  }
}

export type Run = (
  file: string,
  args: string[],
) => Promise<{ kind: 'missing' } | { kind: 'failed' } | { kind: 'output'; stdout: string }>;

/** Runs the command from the first place it is found. */
async function tailscale(args: string[], run: Run): ReturnType<Run> {
  for (const cli of cliCandidates(process.platform, process.env)) {
    const outcome = await run(cli, args);
    if (outcome.kind !== 'missing') return outcome;
  }
  return { kind: 'missing' };
}

/** Runs only when the user opens the Tailscale guide. */
export async function tailscaleStatus(run: Run = runCli): Promise<TailscaleView> {
  const outcome = await tailscale(['status', '--json'], run);
  if (outcome.kind === 'missing') return { kind: 'missing' };
  // It is installed, but its service does not answer.
  if (outcome.kind === 'failed') return { kind: 'off' };
  return readTailscaleStatus(outcome.stdout);
}

/** Reads `tailscale status --json`. Pure, for tests. */
export function readTailscaleStatus(stdout: string): TailscaleView {
  let data: unknown;
  try {
    data = JSON.parse(stdout);
  } catch {
    return { kind: 'off' };
  }
  if (!isObject(data)) return { kind: 'off' };
  const state = data.BackendState;
  if (state === 'NeedsLogin' || state === 'NeedsMachineAuth' || state === 'NoState') {
    return { kind: 'signed-out' };
  }
  if (state !== 'Running') return { kind: 'off' };
  const self = device(data.Self, true);
  const peers = isObject(data.Peer) ? Object.values(data.Peer).slice(0, DEVICE_LIMIT) : [];
  const devices = [self, ...peers.map((peer) => device(peer, false))]
    .filter((item): item is TailscaleDevice => item !== undefined)
    .filter((item) => !NOT_SERVERS.has(item.os.toLowerCase()))
    .sort(
      (a, b) =>
        Number(b.self) - Number(a.self) ||
        Number(b.online) - Number(a.online) ||
        a.name.localeCompare(b.name),
    );
  const tailnet = isObject(data.CurrentTailnet) ? data.CurrentTailnet : {};
  return {
    kind: 'ready',
    name: self?.name ?? '',
    magicDns: tailnet.MagicDNSEnabled === true,
    devices,
  };
}

function device(node: unknown, self: boolean): TailscaleDevice | undefined {
  if (!isObject(node)) return undefined;
  const dns = text(node.DNSName, 253).replace(/\.$/, '');
  const name = text(node.HostName, 63) || dns.split('.')[0];
  if (name === '') return undefined;
  return {
    name,
    os: text(node.OS, 20),
    online: self || node.Online === true,
    self,
    // `tailscale serve` gives the device an https address under its MagicDNS name.
    address: /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(dns) ? `https://${dns.toLowerCase()}` : '',
  };
}

/** A server's https address, as `URL.origin` writes it, to the address ntfy listens on. */
export type Routes = Map<string, string>;

/**
 * Where this computer's `tailscale serve` passes its https addresses on to. Windows does not
 * reach its own `tailscale serve` address, so on the server computer Nightping sends straight
 * to ntfy there.
 */
export async function serveRoutes(run: Run = runCli): Promise<Routes> {
  const outcome = await tailscale(['serve', 'status', '--json'], run);
  return outcome.kind === 'output' ? readServeRoutes(outcome.stdout) : new Map();
}

/** Reads `tailscale serve status --json`: the sites served at their root, to an http address. */
export function readServeRoutes(stdout: string): Routes {
  const routes: Routes = new Map();
  let data: unknown;
  try {
    data = JSON.parse(stdout);
  } catch {
    return routes;
  }
  if (!isObject(data) || !isObject(data.Web)) return routes;
  for (const [site, config] of Object.entries(data.Web)) {
    const root = isObject(config) && isObject(config.Handlers) ? config.Handlers['/'] : undefined;
    const target = isObject(root) && typeof root.Proxy === 'string' ? root.Proxy : '';
    const from = originOf(`https://${site}`);
    if (from !== undefined && isServerUrl(normalizeServer(target))) {
      routes.set(from, normalizeServer(target));
    }
  }
  return routes;
}

/** Where to send for a destination's server, when this computer serves it. */
export function routeFor(routes: Routes, server: string): string | undefined {
  const origin = originOf(server);
  return origin === undefined ? undefined : routes.get(origin);
}

/** Only an address at the root of a server: `tailscale serve` passes on whole sites. */
function originOf(address: string): string | undefined {
  try {
    const url = new URL(address);
    return url.pathname === '/' && url.search === '' ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The routes, asked once and kept: the command takes about a quarter of a second. Asked again
 * when the servers on Tailscale change, for a test (the user may have just run `tailscale
 * serve`), and after a send fails. Not asked at all without a server on Tailscale.
 */
export class ServeRoutes {
  private kept: { servers: string; routes: Promise<Routes> } | undefined;

  constructor(private readonly lookup: () => Promise<Routes> = serveRoutes) {}

  get(servers: string[], fresh = false): Promise<Routes> {
    const onTailscale = [...new Set(servers.filter(isOnTailscale))].sort().join(' ');
    if (onTailscale === '') return Promise.resolve(new Map());
    if (fresh || this.kept?.servers !== onTailscale) {
      this.kept = { servers: onTailscale, routes: this.lookup() };
    }
    return this.kept.routes;
  }

  forget(): void {
    this.kept = undefined;
  }
}

function runCli(file: string, args: string[]): ReturnType<Run> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { timeout: TIMEOUT_MS, windowsHide: true, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' },
      (error, stdout) => {
        if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
          resolve({ kind: 'missing' });
        } else if (stdout.trim().startsWith('{')) {
          // A stopped Tailscale may exit with an error and still print its status.
          resolve({ kind: 'output', stdout });
        } else {
          resolve({ kind: 'failed' });
        }
      },
    );
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}
