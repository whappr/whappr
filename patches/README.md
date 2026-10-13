# Dependency patches

Applied to `node_modules` by [patch-package](https://github.com/ds300/patch-package) from the root
`postinstall` script, on every `npm install` / `npm ci` (locally, in CI and in the gateway's Docker
build). `--error-on-fail` makes the install fail if a patch no longer applies, e.g. after a version
bump.

To change a patch: edit the files under `node_modules/<package>`, then run
`npx patch-package <package>`.

## whatsapp-web.js+1.34.7.patch

WhatsApp Web's July 2026 update renamed the serialized-id property of its id objects from
`_serialized` to `$1`. whatsapp-web.js 1.34.7 reads `_serialized` everywhere, so message ids come
out `undefined`. For the gateway that meant:

- `message.*` events without their message ids;
- `sendMessage` delivering the message but resolving to `undefined`;
- `Message.edit` applying the edit but resolving to `null`;
- `edit`, `delete`, `react` and `downloadMedia` passing `undefined` ids to WhatsApp Web.

The patch backports two upstream fixes, unreleased as of 1.34.7:

- [#201832](https://github.com/wwebjs/whatsapp-web.js/pull/201832) (merged into `main`): falls back
  to `$1` wherever `_serialized` is read, and normalizes the ids of `Message`, `Chat`, `Contact` and
  other structures via `Base._normalizeId`. Its hunk for `Contact.block()` is left out: that code
  doesn't exist in 1.34.7. Its `index.d.ts` hunk only reformats a signature and is left out too.
- [#201901](https://github.com/wwebjs/whatsapp-web.js/pull/201901) (open): restores `_serialized`
  inside the WhatsApp Web page as a getter on the `MsgKey` prototype, for page-side lookups #201832
  doesn't cover.

Not covered upstream: `Reaction.msgId` is passed through without normalization, so the gateway's
`messageIdOf()` (`apps/gateway/src/whatsapp/normalize.ts`) also reads `$1`.

**Remove** this patch once a whatsapp-web.js release includes both PRs. If it includes only #201832,
regenerate the patch with just #201901 on top of it. Upgrading whatsapp-web.js (`npm update`) makes
the install fail if the patch no longer applies, or prints a version-mismatch warning if it still
does; either way, check whether the new release made the patch unnecessary.
