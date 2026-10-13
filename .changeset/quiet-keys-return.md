---
"@whappr/gateway": patch
---

fix: restore message ids after WhatsApp Web renamed `_serialized` to `$1`, which also made sends and edits report failure although they went through
