---
name: Supabase connection for Pensare
description: Session-pooler URL and TLS behavior for the Node PostgreSQL client.
---

Pensare uses the Supabase Session Pooler URI on port 5432 for its application connection. Keep TLS enabled. This environment's `pg-connection-string` rejects Supabase's certificate chain when interpreting `sslmode=require` with its default mode; `uselibpqcompat=true&sslmode=require` connected successfully over TLS.

**Why:** The pooler URI connected in plaintext by default, and strict certificate verification failed with `SELF_SIGNED_CERT_IN_CHAIN`; compatibility mode preserved TLS without that verification failure.

**How to apply:** When changing the Supabase PostgreSQL URI or Node/pg versions, confirm the active connection uses TLS and that schema tooling uses the same URI settings.
