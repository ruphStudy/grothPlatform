# Sprint 31 Performance Review

## Inspected Areas

- Mongo indexes in Team, Billing, Audit, Usage, AI Usage, Notifications, Leads, and Approval queues.
- Pagination and bounded list endpoints for notifications, approvals, leads, billing usage, and audit logs.
- Usage/quota checks from Sprint 30.
- Public lead capture rate bucket and Sprint 31 centralized rate limiter.
- Website Intelligence SSRF path and outbound URL validation.
- Frontend route load and large pages.

## Concrete Fixes

- Added `AuditLog` indexes for organization/time and organization/product/time.
- Added server-side pagination and limit caps to the Audit Logs API.
- Added centralized rate limits for auth, public, API, AI, webhook, and analytics-style routes.
- Kept quota checks on `UsageCounter` instead of aggregating `UsageEvent` per action.
- Added production request IDs and normalized error handling so slow/error traces can be correlated.
- Added bounded API body parsing and security headers.

## Existing Safe Patterns

- Lead list endpoints already cap page size and whitelist sort/filter values.
- Notifications already use bounded pagination.
- Billing usage uses counters and summaries rather than raw event scans.
- Growth Brain context is assembled from bounded query slices rather than full history.

## Remaining Risks

- `ProductPage` and `CampaignDetailPage` are large frontend routes; route-level lazy loading is recommended during deployment optimization if bundle size becomes user-visible.
- Multi-instance rate limiting should move to shared infrastructure during Sprint 32 deployment planning.
- Large export flows should remain capped and may eventually need background jobs.
- Provider SDK calls should use SDK-native timeouts where available during deployment-specific configuration.
