# Changelog

All notable changes to Customs IDP are recorded here.

## Unreleased

### Fixed
- **Issue #3 — Back to inbox visibility:** restricted the top-bar **Back to inbox** button to the pack review page only, so it no longer appears on the inbox or other navigation pages.
- **Issue #4 — Event-driven email intake:** persist email packs as `Processing` before extraction, remove startup mailbox scanning, add server-mediated live inbox refresh, align webhook/recovery idempotency on the Microsoft Graph message ID, and expose Outlook subscription health/renewal logging. The repository also versions the required Supabase Realtime publication migration; live Supabase application remains an infrastructure verification step.
