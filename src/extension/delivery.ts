// Sends one message to several destinations at once. Pure: takes the token lookup and the
// publisher, so tests need no VS Code and no server.
import { displayName, type DestinationEntry } from './config';
import type { Message, PublishOptions, PublishResult } from './ntfy';
import { failureText, type Translate } from './texts';

export interface Failure {
  destination: DestinationEntry;
  result: Exclude<PublishResult, { ok: true }>;
  hasToken: boolean;
  /** The reason, as the history and the panel show it. */
  text: string;
}

export interface Delivery {
  sent: DestinationEntry[];
  failures: Failure[];
}

type Publish = (
  destination: { server: string; topic: string },
  message: Message,
  options: PublishOptions,
) => Promise<PublishResult>;

/** Every destination at the same time, so a slow server does not hold up the others. */
export async function deliver(
  t: Translate,
  targets: DestinationEntry[],
  message: Message,
  tokenFor: (server: string) => Promise<string | undefined>,
  publish: Publish,
): Promise<Delivery> {
  const results = await Promise.all(
    targets.map(async (destination) => {
      const token = await tokenFor(destination.server);
      return { destination, token, result: await publish(destination, message, { token }) };
    }),
  );
  const delivery: Delivery = { sent: [], failures: [] };
  for (const { destination, token, result } of results) {
    if (result.ok) {
      delivery.sent.push(destination);
      continue;
    }
    const hasToken = token !== undefined;
    delivery.failures.push({
      destination,
      result,
      hasToken,
      text: failureText(t, result, destination.server, hasToken),
    });
  }
  return delivery;
}

/**
 * Why it did not go out, or `undefined` when it did everywhere. With more than one destination
 * each reason starts with the destination's name, one per line.
 */
export function deliveryError(delivery: Delivery): string | undefined {
  const { sent, failures } = delivery;
  if (failures.length === 0) return undefined;
  if (sent.length + failures.length === 1) return failures[0].text;
  return failures
    .map((failure) => `${displayName(failure.destination)}: ${failure.text}`)
    .join('\n');
}
