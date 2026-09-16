# GIP Backup and Recovery

## Scope

Production backups cover MongoDB application data and deployment configuration metadata. Runtime secrets are restored from the deployment secret manager or environment, never from a database dump or this repository.

Generated assets or external object storage, if enabled, must have separate provider-native backup or retention configured because MongoDB backups do not cover object storage.

## Baseline

- Target RPO: 24 hours or less.
- Target RTO: 4 hours or less.
- Recommended schedule: daily automated backups.
- Recommended retention: 7 daily backups and 4 weekly backups.
- Backups must be encrypted by the database/object-storage provider.

## MongoDB Atlas

Use Atlas automated backups/snapshots for production clusters. Validate that restore permissions and snapshot retention are configured before launch.

Production should use an explicit database name such as `gip_prod` in `MONGODB_URI`, TLS through the provider default connection string, and a least-privilege application user with `readWrite` on only the application database. Prefer provider network allowlists where backend stable egress is available; if a deployment platform has dynamic egress, document the tradeoff before using broad access.

## Generic MongoDB

Use `mongodump` from a trusted operations host:

```bash
mongodump --uri "$MONGODB_URI" --archive=gip-$(date +%Y%m%d).archive --gzip
```

Restore into an isolated target first:

```bash
mongorestore --uri "$TARGET_MONGODB_URI" --archive=gip-YYYYMMDD.archive --gzip --drop
```

## Restore Procedure

1. Isolate the target environment and stop public traffic.
2. Select the backup snapshot/archive.
3. Restore MongoDB into the target cluster.
4. Restore runtime secrets from the secret manager or environment.
5. Start the application and verify indexes are created.
6. Run smoke checks for auth, organization loading, product loading, billing subscription lookup, and audit log query.
7. Reopen traffic after validation.

## Validation

Do not restore production from the application UI. A non-destructive validation is to verify this document, configured backup provider, restore permissions, and a recent restorable backup exist.

Indexes are created with the non-destructive `npm run db:indexes` command after build/deploy; it does not drop production indexes.
