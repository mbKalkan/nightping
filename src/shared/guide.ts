// What the Tailscale guide tells the user to run on the server, shared so tests check the same.

/** ntfy listens here on the server itself; `tailscale serve` passes HTTPS on to it. */
export const NTFY_PORT = 2586;

/**
 * Starts ntfy with Docker, reachable only from the server itself, then lets `tailscale serve`
 * publish it over HTTPS to the user's own devices. `address` is the server's https MagicDNS
 * address: ntfy needs it as its base URL, and the upstream server wakes up iPhones.
 */
export function serverCommands(address: string): string[] {
  return [
    [
      'docker run -d --name ntfy --restart unless-stopped',
      `-p 127.0.0.1:${NTFY_PORT}:80`,
      '-v ntfy-cache:/var/cache/ntfy',
      '-e NTFY_CACHE_FILE=/var/cache/ntfy/cache.db',
      `-e NTFY_BASE_URL=${address}`,
      '-e NTFY_UPSTREAM_BASE_URL=https://ntfy.sh',
      'binwiederhier/ntfy serve',
    ].join(' '),
    `tailscale serve --bg ${NTFY_PORT}`,
  ];
}

/**
 * A prompt as the agent gets it: its lines joined, and `{0}`, `{1}`… replaced by `values`.
 * - `tailscale`: no values.
 * - `ntfy`: the server's address, then its two commands from `serverCommands`.
 * - `token`: the server's address, then the topic.
 */
export function fillPrompt(lines: string[], values: string[]): string {
  return lines
    .join('\n')
    .replace(/\{(\d+)\}/g, (match, index: string) => values[Number(index)] ?? match);
}
