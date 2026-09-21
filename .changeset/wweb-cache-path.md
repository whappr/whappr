---
"@whappr/gateway": minor
---

Rename `WHAPPR_SESSION_PATH` to `WWEB_SESSION_PATH` and add `WWEB_CACHE_PATH` to control where
whatsapp-web.js persists its WhatsApp Web version cache (`.wwebjs_cache` by default), keeping
whatsapp-web.js-specific paths under a `WWEB_` prefix distinct from `WHAPPR_` app config.
