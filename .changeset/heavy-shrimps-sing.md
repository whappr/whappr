---
"@whappr/client": patch
"@whappr/gateway": patch
"@whappr/protocol": patch
---

feat: add group management features and enhance message handling

- Introduced `GroupsApi` for managing group-related operations including listing groups, retrieving group details, and leaving groups.
- Updated `MessagesApi` to include `downloadMedia` method for downloading message media files.
- Enhanced error handling with `WhapprAbortError` for request cancellations.
- Added support for idempotency in message sending to prevent duplicate messages.
- Updated protocol definitions to include group events and structures.
- Improved client methods to accept per-call options for better flexibility.
- Refactored transport layer to handle request options and timeouts more effectively.
