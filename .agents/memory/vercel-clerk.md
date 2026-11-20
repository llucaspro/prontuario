---
name: Vercel hosting and Clerk
description: Production authentication requirements when hosting Pensare outside Replit.
---

Replit-managed Clerk separates Development and Production environments and automatically switches keys when Replit publishes the app. That automatic switch does not apply to a Vercel deployment; Vercel needs the Production Clerk keys and its domain configured for the production instance.

**Why:** Development keys are intended for previews and are not suitable for a public production deployment.

**How to apply:** Before deploying Pensare on Vercel, require the Production publishable and secret keys to be configured in Vercel's environment settings. Never commit or send key values through chat.
