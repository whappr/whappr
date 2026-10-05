import type {
  EditMessageRequest,
  MediaInput,
  MessageResponse,
  SendMessageRequest,
  SetReactionRequest,
} from '@whappr/protocol';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import type { WhatsappClient } from '../../whatsapp/client.js';
import { mediaTooLargeError } from '../../whatsapp/media.js';
import type { AppEnv } from '../app.js';
import { validateBody } from '../middlewares.js';

// Flat objects refined by hand rather than unions, so a bad request gets an error naming the
// field instead of zod's generic "Invalid input" for unions.
const mediaSchema = z
  .object({
    as: z.enum(['voice', 'document']).optional(),
    fileName: z.string().min(1).optional(),
    url: z.url({ protocol: /^https?$/ }).optional(),
    data: z.base64().optional(),
    mimeType: z.string().min(1).optional(),
  })
  .transform((media, ctx): MediaInput => {
    const { as, fileName, url, data, mimeType } = media;
    if (url !== undefined && data !== undefined) {
      ctx.addIssue({ code: 'custom', message: 'set either url or data, not both', path: ['url'] });
    } else if (url !== undefined) {
      return { as, fileName, url, mimeType };
    } else if (data === undefined) {
      ctx.addIssue({ code: 'custom', message: 'url or data is required', path: ['url'] });
    } else if (mimeType === undefined) {
      ctx.addIssue({ code: 'custom', message: 'required with data', path: ['mimeType'] });
    } else {
      return { as, fileName, data, mimeType };
    }
    return z.NEVER;
  });

const sendMessageSchema = z
  .object({
    to: z.string().min(1),
    text: z.string().min(1).optional(),
    media: mediaSchema.optional(),
    replyTo: z.string().min(1).optional(),
  })
  .transform(({ to, text, media, replyTo }, ctx): SendMessageRequest => {
    if (media) return { to, media, text, replyTo };
    if (text !== undefined) return { to, text, replyTo };
    ctx.addIssue({ code: 'custom', message: 'text or media is required', path: ['text'] });
    return z.NEVER;
  }) satisfies z.ZodType<SendMessageRequest>;

// Inline `data` arrives base64-encoded (4 bytes per 3), plus room for the rest of the JSON.
const BODY_OVERHEAD_BYTES = 1024 * 1024;

function sendBodyLimit(mediaMaxBytes: number) {
  return bodyLimit({
    maxSize: Math.ceil((mediaMaxBytes * 4) / 3) + BODY_OVERHEAD_BYTES,
    onError: () => {
      throw mediaTooLargeError(mediaMaxBytes);
    },
  });
}

const editMessageSchema = z.object({
  text: z.string().min(1),
}) satisfies z.ZodType<EditMessageRequest>;

const setReactionSchema = z.object({
  emoji: z.string().min(1),
}) satisfies z.ZodType<SetReactionRequest>;

// RFC 6266 / RFC 8187: `filename*` carries non-ASCII names; encodeURIComponent leaves a few
// characters RFC 8187 doesn't allow unescaped.
function contentDisposition(fileName: string | undefined): string {
  if (!fileName) return 'attachment';
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename*=UTF-8''${encoded}`;
}

export function createMessagesRoute(client: WhatsappClient, mediaMaxBytes: number): Hono<AppEnv> {
  return new Hono<AppEnv>()
    .post('/', sendBodyLimit(mediaMaxBytes), validateBody(sendMessageSchema), async (c) => {
      const message = await client.sendMessage(c.req.valid('json'));
      return c.json({ message } satisfies MessageResponse, 201);
    })
    .patch('/:id', validateBody(editMessageSchema), async (c) => {
      const { text } = c.req.valid('json');
      const message = await client.editMessage(c.req.param('id'), text);
      return c.json({ message } satisfies MessageResponse);
    })
    .delete('/:id', async (c) => {
      await client.deleteMessage(c.req.param('id'));
      return c.body(null, 204);
    })
    .get('/:id/media', async (c) => {
      const { data, mimeType, fileName } = await client.downloadMedia(c.req.param('id'));
      return c.body(data, 200, {
        'Content-Type': mimeType,
        'Content-Length': String(data.byteLength),
        'Content-Disposition': contentDisposition(fileName),
      });
    })
    .put('/:id/reaction', validateBody(setReactionSchema), async (c) => {
      const { emoji } = c.req.valid('json');
      await client.reactToMessage(c.req.param('id'), emoji);
      return c.body(null, 204);
    })
    .delete('/:id/reaction', async (c) => {
      await client.reactToMessage(c.req.param('id'), '');
      return c.body(null, 204);
    });
}
