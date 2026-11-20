---
name: Neon connection for Pensare
description: Connection choice for the project's Neon database.
---

**Rule:** Use the direct Neon PostgreSQL connection URL for the Pensare app; the compute's pooler endpoint is not enabled.

**Why:** The pooled URL timed out during connection testing, while the direct endpoint connected and the schema setup succeeded.

**How to apply:** Before changing this connection, check the Neon compute's `pooler_enabled` setting. Use the direct URL unless pooling has been explicitly enabled.
