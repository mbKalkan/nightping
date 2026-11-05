// Asks the tailscale command on this computer for the user's devices, so the guide can offer one
// as the server. Runs only when the user opens the Tailscale guide; nothing leaves the computer.
import { execFile } from 'node:child_process';
import * as path from 'node:path';
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

export async function tailscaleStatus(run: Run = runCli): Promise<TailscaleView> {
  for (const cli of cliCandidates(process.platform, process.env)) {
    const outcome = await run(cli, ['status', '--json']);
    if (outcome.kind === 'missing') continue;
    // It is installed, but its service does not answer.
    if (outcome.kind === 'failed') return { kind: 'off' };
    return readTailscaleStatus(outcome.stdout);
  }
  return { kind: 'missing' };
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
