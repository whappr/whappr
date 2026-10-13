/**
 * Runtime patches for whatsapp-web.js bugs that are fixed upstream but not yet released. Imported
 * by `client.ts`: the Node-side patch applies on import, before any whatsapp-web.js structure is
 * created; the page-side one is installed by `client.ts` on every `ready`.
 *
 * Remove each patch once the whatsapp-web.js release the gateway depends on ships its fix.
 */
import wwebjs from 'whatsapp-web.js';

/**
 * WhatsApp Web's July 2026 update renamed the message key's `_serialized` property to `$1`.
 * whatsapp-web.js 1.34.7 still reads `id._serialized`, both in our code and inside its own
 * `Message` methods (`edit`, `delete`, `react`, `downloadMedia`, `getQuotedMessage`, ...), so
 * every one of them gets `undefined`.
 *
 * Backport of upstream's fix (`Base._normalizeId`, applied in `Message._patch`; on whatsapp-web.js
 * `main` but unreleased): after a `Message` is patched, copy `$1` into `_serialized`. A no-op
 * when `_serialized` is already present, so it is harmless once the fix ships.
 *
 * REMOVE once whatsapp-web.js ships `Base._normalizeId`, along with the `$1` fallback in
 * `messageIdOf()` (normalize.ts), which also covers `Reaction` keys this patch doesn't reach.
 */
function restoreSerializedMessageIds(): void {
  // `Message` is exported at runtime but typed only as an interface.
  const { Message } = wwebjs as unknown as {
    Message: { prototype: { _patch(this: { id: unknown }, data: unknown): unknown } };
  };
  const proto = Message.prototype;
  const patch = proto._patch;
  proto._patch = function (data) {
    const result = patch.call(this, data);
    const key = this.id as { _serialized?: unknown; $1?: unknown } | null | undefined;
    if (key && key._serialized == null && typeof key.$1 === 'string') {
      this.id = { ...key, _serialized: key.$1 };
    }
    return result;
  };
}

restoreSerializedMessageIds();

/**
 * The same `_serialized` → `$1` rename, inside the WhatsApp Web page. whatsapp-web.js's injected
 * code looks messages up by `msgKey._serialized`, which is now `undefined`:
 * - `sendMessage` delivers the message, then resolves to `undefined` instead of the sent message;
 * - `Message.edit` applies the edit, then resolves to `null` (which reads as "edit not allowed").
 *
 * Backport of upstream PR #201901 (open, unreleased): a `_serialized` getter on the `MsgKey`
 * prototype that returns `toString()`, the key's serialized form. Its setter stores an own
 * property, so builds that still assign `_serialized` in the constructor keep their value. Skipped
 * when the prototype already defines `_serialized`, so it is harmless once the fix ships.
 *
 * The page's code (and this patch with it) is reloaded when WhatsApp Web navigates, and
 * whatsapp-web.js emits `ready` again after re-injecting, so call this on every `ready`.
 *
 * REMOVE once whatsapp-web.js ships the `MsgKey` prototype getter.
 */
export async function restoreSerializedMsgKeysInPage(client: wwebjs.Client): Promise<void> {
  await client.pupPage?.evaluate(() => {
    // Runs in the browser, where whatsapp-web.js loads WhatsApp Web's modules via `require`.
    const { require } = globalThis as unknown as { require(module: string): { prototype: object } };
    const proto = require('WAWebMsgKey').prototype;
    if ('_serialized' in proto) return;
    Object.defineProperty(proto, '_serialized', {
      configurable: true,
      get(this: { toString(): string }) {
        return this.toString();
      },
      set(this: object, value: unknown) {
        Object.defineProperty(this, '_serialized', {
          value,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      },
    });
  });
}
