# Domain and SSL Setup

Use configurable domains. Recommended pattern:

- `app.example.com` -> frontend hosting
- `api.example.com` -> backend hosting

TLS should be managed by Vercel, Render, Railway, Cloudflare, or the selected load balancer. Do not store certificates in this repository.

## DNS

1. Add frontend domain in the frontend hosting provider.
2. Create the CNAME/A record requested by the provider.
3. Add backend domain in the backend hosting provider.
4. Create the DNS record requested by the provider.
5. Wait for certificate issuance.
6. Set backend env:
   - `BACKEND_PUBLIC_URL=https://api.example.com`
   - `FRONTEND_PUBLIC_URL=https://app.example.com`
   - `FRONTEND_BASE_URL=https://app.example.com`
   - `CORS_ORIGINS=https://app.example.com`
7. Set frontend env:
   - `VITE_API_BASE_URL=https://api.example.com/api/v1`

## Callback and Webhook Inventory

- Social OAuth callback: `https://api.example.com/api/v1/social-connections/callback`
- Email provider webhook: `https://api.example.com/api/v1/webhooks/email/...` if enabled
- Billing Stripe webhook: `https://api.example.com/api/v1/webhooks/billing/stripe`
- Invitation links: generated from `FRONTEND_BASE_URL`
- Billing checkout redirects: generated from `FRONTEND_BASE_URL`
- CMS callbacks: use the backend public URL if a provider requires one

## Alignment

CORS must include the frontend domain. Frontend CSP must allow API, monitoring, and storage/CDN domains through `connect-src`/`img-src` as configured in `frontend/vercel.json`.
