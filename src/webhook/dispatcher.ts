import type { AnyWhapprEvent } from '../events/types.js';
import type { Logger } from '../logging/logger.js';
import { signPayload } from '../security/signature.js';

const WEBHOOK_TIMEOUT_MS = 5000;

export async function dispatchEvents(
  webhookUrl: string,
  secret: string,
  events: AnyWhapprEvent[],
  logger: Logger,
): Promise<void> {
  const rawBody = JSON.stringify(events);
  const { timestamp, signature } = signPayload(secret, rawBody);
  const eventIds = events.map((event) => event.id).join(', ');

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Whappr-Timestamp': timestamp,
        'X-Whappr-Signature': signature,
      },
      body: rawBody,
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });

    if (!response.ok) {
      logger.error(
        { status: response.status, statusText: response.statusText, eventIds },
        'webhook delivery failed',
      );
    }
  } catch (error) {
    logger.error({ error, eventIds }, 'webhook delivery failed');
  }
}
