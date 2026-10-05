import type { MediaInput } from '@whappr/protocol';
import wwebjs from 'whatsapp-web.js';
import { WhatsappError } from './errors.js';

const { MessageMedia } = wwebjs;

const FETCH_TIMEOUT_MS = 60_000;
const FALLBACK_MIME_TYPE = 'application/octet-stream';

export type OutgoingMediaKind = 'image' | 'video' | 'audio' | 'voice' | 'document';

export interface OutgoingMedia {
  media: wwebjs.MessageMedia;
  kind: OutgoingMediaKind;
}

export function mediaTooLargeError(maxBytes: number): WhatsappError {
  return new WhatsappError(
    `Media is over the ${maxBytes}-byte limit (MEDIA_MAX_SIZE)`,
    'MEDIA_TOO_LARGE',
  );
}

// WhatsApp renders a file by its MIME type; `as` only opts into a voice note or a document.
function kindOf(as: MediaInput['as'], mimeType: string): OutgoingMediaKind {
  if (as) return as;
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

function fileNameFromUrl(url: string): string | undefined {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
    return name === '' ? undefined : name;
  } catch {
    return undefined;
  }
}

async function fetchMedia(
  url: string,
  maxBytes: number,
): Promise<{ data: Buffer; mimeType?: string }> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (cause) {
    throw new WhatsappError(`Failed to fetch ${url}`, 'MEDIA_FETCH_FAILED', cause);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new WhatsappError(
      `Fetching ${url} failed with status ${response.status}`,
      'MEDIA_FETCH_FAILED',
    );
  }
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw mediaTooLargeError(maxBytes);
  }

  // Counted while streaming too: Content-Length may be missing or wrong.
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for await (const chunk of response.body ?? []) {
      total += chunk.byteLength;
      if (total > maxBytes) throw mediaTooLargeError(maxBytes);
      chunks.push(chunk);
    }
  } catch (cause) {
    if (cause instanceof WhatsappError) throw cause;
    throw new WhatsappError(`Failed to read ${url}`, 'MEDIA_FETCH_FAILED', cause);
  }

  return {
    data: Buffer.concat(chunks, total),
    mimeType: response.headers.get('content-type') ?? undefined,
  };
}

/** Loads a request's file — fetching it if given by `url` — and settles how to send it. */
export async function loadOutgoingMedia(
  input: MediaInput,
  maxBytes: number,
): Promise<OutgoingMedia> {
  if ('data' in input) {
    const size = Buffer.byteLength(input.data, 'base64');
    if (size > maxBytes) throw mediaTooLargeError(maxBytes);
    return {
      media: new MessageMedia(input.mimeType, input.data, input.fileName, size),
      kind: kindOf(input.as, input.mimeType),
    };
  }

  const fetched = await fetchMedia(input.url, maxBytes);
  const mimeType = input.mimeType ?? fetched.mimeType ?? FALLBACK_MIME_TYPE;
  const fileName = input.fileName ?? fileNameFromUrl(input.url);
  return {
    media: new MessageMedia(
      mimeType,
      fetched.data.toString('base64'),
      fileName,
      fetched.data.length,
    ),
    kind: kindOf(input.as, mimeType),
  };
}
