/**
 * Runtime patches for whatsapp-web.js bugs that are fixed upstream but not yet released. Imported
 * for its side effects by `client.ts`, before any whatsapp-web.js structure is created.
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
