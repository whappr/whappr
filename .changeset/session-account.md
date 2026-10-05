---
"@whappr/protocol": patch
"@whappr/gateway": patch
"@whappr/client": patch
---

`GET /api/session` now returns `account` (`{ id, phone, name? }`) while the session is `ready`, and the pairing page shows it
