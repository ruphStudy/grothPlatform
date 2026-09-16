# Monitoring and Logs

## Application Logs

Production logs are written to stdout/stderr as JSON. Hosting providers should collect these logs.

Important fields:

- `timestamp`
- `level`
- `requestId`
- `method`
- `route`
- `status`
- `durationMs`
- `userId` when authenticated

Secrets, authorization headers, provider payloads, and full request bodies must not be logged.

## Error Monitoring

Sprint 31 introduced `ErrorMonitoringService`. Configure:

- `ERROR_MONITORING_ENABLED=true`
- `SENTRY_DSN`
- `SENTRY_ENVIRONMENT`
- `SENTRY_RELEASE`
- `APP_VERSION` or `GIT_SHA`

Frontend uses only public Vite monitoring config such as `VITE_ERROR_MONITORING_DSN`.

## Health

Use `/health/ready` for platform readiness checks and `/health/live` for liveness checks.

## Database Monitoring

Enable Atlas alerts for:

- connection count
- storage utilization
- slow queries
- CPU or cluster health where available
- backup failures

## Provider Errors

Billing webhook failures, email provider errors, social provider errors, CMS errors, and AI provider errors should be logged with normalized provider/error codes and request IDs. Do not log credentials.

## Uptime

Use the hosting provider uptime checks or an external uptime monitor against `/health/ready`. No paid uptime provider is required by this repository.
