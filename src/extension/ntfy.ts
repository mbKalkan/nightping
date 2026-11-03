// Publishes one message to an ntfy server. Pure: no VS Code, so tests run it against a fake server.
import type { Destination } from './config';

export interface Message {
  title: string;
  message: string;
  /** ntfy tags; emoji short codes such as `warning` show as emojis on the phone. */
  tags?: string[];
  /** 1 (min) to 5 (max); ntfy uses 3 when it is left out. */
  priority?: 1 | 2 | 3 | 4 | 5;
}

export interface PublishOptions {
  token?: string;
  timeoutMs?: number;
}

export type PublishResult =
  | { ok: true }
  | { ok: false; reason: 'unauthorized'; status: number }
  | { ok: false; reason: 'redirect'; status: number; location: string }
  | { ok: false; reason: 'http'; status: number; detail: string }
  | { ok: false; reason: 'unreachable'; detail: string }
  | { ok: false; reason: 'timeout'; seconds: number };

export const TIMEOUT_MS = 10_000;
const DETAIL_LIMIT = 200;

export async function publish(
  destination: Destination,
  message: Message,
  options: PublishOptions = {},
): Promise<PublishResult> {
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  // ntfy takes a JSON message at the root of the server, with the topic in the body.
  const url = `${destination.server}/`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  let response: Response;
  let body: string;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ topic: destination.topic, ...message }),
      // A redirect would turn the POST into a GET or carry the token to another address.
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    body = await response.text();
  } catch (error) {
    if (isTimeout(error)) {
      return { ok: false, reason: 'timeout', seconds: timeoutMs / 1000 };
    }
    return { ok: false, reason: 'unreachable', detail: describe(error) };
  }

  const { status } = response;
  if (status >= 200 && status < 300) {
    return { ok: true };
  }
  if (status === 401 || status === 403) {
    return { ok: false, reason: 'unauthorized', status };
  }
  const location = response.headers.get('location');
  if (status >= 300 && status < 400 && location) {
    return { ok: false, reason: 'redirect', status, location: new URL(location, url).href };
  }
  return { ok: false, reason: 'http', status, detail: serverError(body) };
}

function isTimeout(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === 'TimeoutError';
}

/** Node's fetch says only "fetch failed"; the cause has the useful part, such as ECONNREFUSED. */
function describe(error: unknown): string {
  const source = error instanceof Error && error.cause !== undefined ? error.cause : error;
  if (source !== null && typeof source === 'object') {
    const { code, message } = source as { code?: unknown; message?: unknown };
    if (typeof code === 'string' && code !== '') {
      return code;
    }
    if (typeof message === 'string' && message !== '') {
      return cut(message);
    }
  }
  return cut(String(error));
}

/** ntfy explains errors as `{"error": "…"}`; anything else (a proxy's HTML page) is dropped. */
function serverError(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: unknown } | null;
    return typeof parsed?.error === 'string' ? cut(parsed.error) : '';
  } catch {
    return '';
  }
}

function cut(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > DETAIL_LIMIT ? `${line.slice(0, DETAIL_LIMIT - 1)}…` : line;
}
