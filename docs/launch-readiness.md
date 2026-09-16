# GIP Launch Readiness

This checklist must be completed before public production launch. Final Terms and Privacy content must be reviewed and approved by qualified legal counsel or the business owner before production use.

## Application

- [ ] Backend production deployment healthy
- [ ] Frontend production deployment healthy
- [ ] Version/release visible
- [ ] Production env validated

## Database

- [ ] Production MongoDB configured
- [ ] Required indexes present
- [ ] Automated backup enabled
- [ ] Restore process reviewed

## Storage

- [ ] Object storage configured
- [ ] Private/public asset policy verified
- [ ] Generated assets survive redeploy

## Security

- [ ] HTTPS active
- [ ] CORS correct
- [ ] Rate limiting active
- [ ] Security headers active
- [ ] SSRF protections active
- [ ] Secret redaction verified

## Auth

- [ ] Public signup works
- [ ] Login works
- [ ] Invitation flow works
- [ ] Password policy verified

## Billing

- [ ] Plans verified
- [ ] Trial verified
- [ ] Checkout verified in test mode
- [ ] Webhook verified
- [ ] Cancel/reactivate verified
- [ ] Quotas verified
- [ ] Live billing switch is deliberate

## Email

- [ ] System sender verified
- [ ] Invite Email works
- [ ] Approval Email works
- [ ] Trial Email policy checked

## Product

- [ ] Onboarding works
- [ ] First Product creation works
- [ ] Dashboard usable
- [ ] Product tour works
- [ ] Empty states usable

## Team

- [ ] Roles work
- [ ] Product access works
- [ ] Approval permissions work

## AI

- [ ] AI provider production key configured
- [ ] AI usage metering verified
- [ ] Quotas protect AI actions
- [ ] No AI call occurs unintentionally on page load

## Analytics

- [ ] Public analytics collector works
- [ ] Analytics Dashboard receives production events
- [ ] Attribution pipeline checked

## Monitoring

- [ ] Error monitoring configured
- [ ] Health checks active
- [ ] Logs available
- [ ] Request IDs visible
- [ ] DB alerts configured/manual check

## Legal

- [ ] Terms page live
- [ ] Privacy page live
- [ ] Signup acceptance recorded
- [ ] Final legal review completed manually

## Domains

- [ ] Frontend domain live
- [ ] Backend domain live
- [ ] SSL valid
- [ ] OAuth callbacks updated
- [ ] Billing webhook URL updated
- [ ] Email webhook URL updated

## CI/CD

- [ ] Production pipeline passes
- [ ] Rollback procedure understood

## Support

- [ ] Support contact configured
- [ ] Support inbox monitored
- [ ] Incident owner identified

## Smoke

- [ ] Signup
- [ ] Onboarding
- [ ] Product
- [ ] Content
- [ ] Leads
- [ ] CRM
- [ ] Analytics
- [ ] Growth Brain
- [ ] Approvals
- [ ] Billing
- [ ] Logout/login
