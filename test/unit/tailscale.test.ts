import { describe, expect, it } from 'vitest';
import { serverCommands } from '../../src/shared/guide';
import {
  cliCandidates,
  readTailscaleStatus,
  tailscaleStatus,
  type Run,
} from '../../src/extension/tailscale';

// Shaped like `tailscale status --json` (Tailscale 1.104), with made-up names.
const status = {
  Version: '1.104.4',
  BackendState: 'Running',
  CurrentTailnet: {
    Name: 'user@example.com',
    MagicDNSSuffix: 'tail1234.ts.net',
    MagicDNSEnabled: true,
  },
  Self: {
    HostName: 'desk',
    DNSName: 'desk.tail1234.ts.net.',
    OS: 'windows',
    Online: false,
    TailscaleIPs: ['100.64.0.1'],
  },
  Peer: {
    'nodekey:1': {
      HostName: 'pixel',
      DNSName: 'pixel.tail1234.ts.net.',
      OS: 'android',
      Online: true,
    },
    'nodekey:2': { HostName: 'nas', DNSName: 'nas.tail1234.ts.net.', OS: 'linux', Online: false },
    'nodekey:3': { HostName: 'box', DNSName: 'Box.tail1234.ts.net.', OS: 'linux', Online: true },
    'nodekey:4': { HostName: 'ipad', DNSName: 'ipad.tail1234.ts.net.', OS: 'iOS', Online: true },
  },
};

describe('readTailscaleStatus', () => {
  it('offers this computer first, then the computers that are online, but no phones', () => {
    expect(readTailscaleStatus(JSON.stringify(status))).toEqual({
      kind: 'ready',
      name: 'desk',
      magicDns: true,
      devices: [
        {
          name: 'desk',
          os: 'windows',
          online: true,
          self: true,
          address: 'https://desk.tail1234.ts.net',
        },
        {
          name: 'box',
          os: 'linux',
          online: true,
          self: false,
          address: 'https://box.tail1234.ts.net',
        },
        {
          name: 'nas',
          os: 'linux',
          online: false,
          self: false,
          address: 'https://nas.tail1234.ts.net',
        },
      ],
    });
  });

  it('gives no address without MagicDNS', () => {
    const view = readTailscaleStatus(
      JSON.stringify({
        ...status,
        CurrentTailnet: { MagicDNSEnabled: false },
        Self: { HostName: 'desk', DNSName: '', OS: 'windows' },
        Peer: {},
      }),
    );
    expect(view).toMatchObject({ kind: 'ready', magicDns: false });
    expect(view.kind === 'ready' && view.devices[0].address).toBe('');
  });

  it('says when Tailscale is signed out, stopped or says nothing useful', () => {
    for (const state of ['NeedsLogin', 'NeedsMachineAuth', 'NoState']) {
      expect(readTailscaleStatus(JSON.stringify({ BackendState: state })).kind).toBe('signed-out');
    }
    expect(readTailscaleStatus(JSON.stringify({ BackendState: 'Stopped' })).kind).toBe('off');
    expect(readTailscaleStatus('not json').kind).toBe('off');
    expect(readTailscaleStatus('[]').kind).toBe('off');
  });

  it('leaves out names that cannot be an address', () => {
    const view = readTailscaleStatus(
      JSON.stringify({
        ...status,
        Peer: {
          'nodekey:9': { HostName: 'odd', DNSName: 'odd name<script>.ts.net.', OS: 'linux' },
        },
      }),
    );
    expect(view.kind === 'ready' && view.devices[1]).toMatchObject({ name: 'odd', address: '' });
  });
});

describe('tailscaleStatus', () => {
  it('tries each place the command may be until one runs', async () => {
    const tried: string[] = [];
    const run: Run = (file) => {
      tried.push(file);
      return Promise.resolve(
        tried.length === 1
          ? { kind: 'missing' }
          : { kind: 'output', stdout: JSON.stringify(status) },
      );
    };
    expect((await tailscaleStatus(run)).kind).toBe('ready');
    expect(tried).toEqual(cliCandidates(process.platform, process.env).slice(0, 2));
  });

  it('says it is missing when no place has it, and off when its service does not answer', async () => {
    expect((await tailscaleStatus(() => Promise.resolve({ kind: 'missing' }))).kind).toBe(
      'missing',
    );
    expect((await tailscaleStatus(() => Promise.resolve({ kind: 'failed' }))).kind).toBe('off');
  });

  it('looks where each installer puts it', () => {
    expect(cliCandidates('win32', { ProgramFiles: 'D:\\Programs' })).toEqual([
      'tailscale',
      'D:\\Programs\\Tailscale\\tailscale.exe',
    ]);
    expect(cliCandidates('darwin', {})).toContain(
      '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
    );
    expect(cliCandidates('linux', {})[0]).toBe('tailscale');
  });
});

describe('serverCommands', () => {
  it('keeps ntfy on the server itself and publishes it to the tailnet over HTTPS', () => {
    const [docker, serve] = serverCommands('https://box.tail1234.ts.net');
    expect(docker).toContain('-p 127.0.0.1:2586:80');
    expect(docker).toContain('-e NTFY_BASE_URL=https://box.tail1234.ts.net');
    expect(docker).toContain('-e NTFY_UPSTREAM_BASE_URL=https://ntfy.sh');
    expect(docker).toContain('-e NTFY_CACHE_FILE=/var/cache/ntfy/cache.db');
    expect(docker).toMatch(/binwiederhier\/ntfy serve$/);
    expect(serve).toBe('tailscale serve --bg 2586');
  });
});
