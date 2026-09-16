# CI/CD

## Workflow

`.github/workflows/ci.yml` runs on pull requests and pushes to `sprintdev`, `main`, and `master`.

It performs:

- `npm ci` in `backend/`
- backend build
- `npm ci` in `frontend/`
- frontend build

The workflow uses placeholder compile-time environment values and does not call live AI, payment, email, social, CMS, or database providers.

## Branch Policy

- `sprintdev`: development/integration validation
- `main` or `master`: production release candidate

Production deployment should be triggered by merge to production branch or manual provider deployment, not by pull request.

## Required Secrets

Provider deployment tokens should be stored in GitHub Actions secrets or deployment platform env stores. Do not commit:

- MongoDB passwords
- storage access keys
- Stripe secrets
- OpenAI/API provider keys
- Vercel/Render tokens
- Sentry auth tokens

## Deployment Sequence

1. CI build passes.
2. Backend image/build is deployed.
3. Non-destructive index creation runs: `npm run db:indexes`.
4. Backend readiness is checked.
5. Frontend deployment points at the production API URL.
6. Provider webhooks/callbacks are verified.

## Rollback

- Backend: redeploy the previous container/deployment revision.
- Frontend: promote the previous static deployment.
- Database: avoid destructive schema changes; use backup restore only for incident recovery.
