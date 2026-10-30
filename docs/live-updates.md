# Live updates (Web + Expo)

The active, visible client holds one authenticated HTTP long poll at
`GET /api/tenants/:slug/live?since=<revision>`. A request returns immediately
when its cursor is outdated, otherwise waits for up to 20 seconds. The server
checks the durable cursor once per second. No domain data, employee IDs or
change descriptions are included; ordinary domain APIs enforce scopes as before.
The endpoint checks tenant membership, billing, account lock and 2FA requirements.
A revoked membership is checked again before returning a cursor. Responses are
private and must never be cached. Requests are rate limited per account.

## Database and deployment

Run `prisma migrate deploy` and `prisma generate` with the normal release.
Migration `20261029170000_tenant_live_revision` installs the cursor table and
PostgreSQL triggers. Changes update the cursor inside the same transaction:
rolled-back writes do not notify clients, and separate processes/instances use
the same state. Deferred constraint triggers take the shared cursor lock at
commit, after domain writes, to avoid lock-order inversions in multi-row saves.
There is no in-memory pub/sub dependency or new external service.

The migration attaches triggers to existing tenant domain tables and explicitly
to child tables for info-request items, breaks, team/location membership and role
permissions. When introducing a new domain table, install its trigger in that
migration too. Audit, timeline, reminder delivery logs and editor drafts are
excluded. Opening an editor still fetches its cross-device draft from the server.

The route uses Node runtime and a 30-second execution budget. Proxy/request
limits must allow this (long polls finish after about 20 seconds). Each visible
client uses approximately one lightweight indexed cursor SELECT per second while
waiting. At larger concurrent-client counts, replace the waiting implementation
with shared PostgreSQL LISTEN/NOTIFY or a broker, keeping the durable cursor and
client recovery contract. Restricting the heartbeat to active clients avoids
unnecessary background work.

## Client behaviour

Expo invalidates tenant domain queries, permissions and the tenant list on a
changed cursor. Inactive queries are marked stale for their next use; visible
queries refetch immediately. An open editor's draft is not replaced. Cached API
responses are disabled. The obsolete shift-offer interval is removed.

Web refreshes Server Components and the navigation notification feed while
preserving component/form state. Both clients stop their connection when hidden,
resume and refresh on foreground, retry network errors with bounded backoff, and
time out hanging requests after 30 seconds. A remembered cursor catches changes
made during interruptions; a fresh mount refreshes once to close the initial
load/subscription race. Tenant switching and logout abort the old connection.

Published shift snapshots remain the employee-facing source of truth. Draft
shift changes refresh planners but are only visible to employees after publishing.
Live refresh is independent of push permission and also works in Expo Go.
Background notifications continue to use the existing push integration.

## Verification

`tests/live-updates.test.ts` covers tenant isolation, anonymous access, invalid
cursors, committed and rolled-back writes, nested permission changes, waiting,
catch-up, cancellation and membership revocation against an isolated database.
`tests/e2e/live-updates.spec.ts` checks automatic list insertion/update/deletion
and recovery from an interrupted HTTP connection in a real browser.
