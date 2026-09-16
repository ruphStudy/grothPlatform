# GIP Deployment

This repository is deployment-ready, but this document does not claim cloud resources have been provisioned.

## Target Architecture

- Frontend: Vercel static SPA from `frontend/`
- Backend: Docker web service from `backend/` on Render or equivalent container host
- Database: MongoDB Atlas
- Storage: S3-compatible private bucket
- TLS: managed by Vercel/Render/DNS provider
- CI: GitHub Actions build validation

## Steps

1. Provision MongoDB Atlas database, for example `gip_prod`.
2. Create least-privilege MongoDB user with `readWrite` on the app database.
3. Enable Atlas automated backups and alerts.
4. Provision S3-compatible private bucket and scoped access key.
5. Deploy backend using `backend/Dockerfile` or `render.yaml`.
6. Configure backend env from `.env.example`, using real secrets in provider secret storage.
7. Run `npm run db:indexes` after backend build against production once credentials are configured. This creates/verifies indexes and does not drop indexes.
8. Verify `GET /health/live` and `GET /health/ready`.
9. Deploy frontend from `frontend/` with `VITE_API_BASE_URL=https://api.example.com/api/v1`.
10. Attach domains and enable managed SSL.
11. Configure provider callbacks/webhooks.
12. Enable monitoring via `ERROR_MONITORING_ENABLED`, Sentry env values, and hosting logs.
13. Run smoke checks.

## Smoke Checklist

- Auth login/register
- Organization and product loading
- Content UI loads without invoking live AI unless intentionally tested
- Public lead form loads and submits test data
- CRM and Email UI load
- Analytics dashboard loads
- Approvals page loads
- Teams page loads
- Billing page loads in Stripe test mode
- Growth Brain access is gated and no live run is triggered by default
- `/health/ready` is green

## Production Safety

Do not store `.env` in the image or repository. Do not run destructive database migrations automatically. Do not call paid AI, email, social, CMS, or payment provider actions during routine deployment validation.
