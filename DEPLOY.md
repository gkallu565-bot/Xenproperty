# XenProperty — Firebase Deployment Guide

Status: **backend code complete and tested. Hosting is deployed; Cloud Functions remain blocked until Blaze is enabled.**
Blocked on: Firebase **Blaze** plan (required for Cloud Functions, Secret Manager, Storage).

---

## What is already done

| Step | State |
|---|---|
| All security bugs fixed + verified (401/403/200 matrix) | ✅ |
| Firestore API enabled in `xenproperty-5944b` | ✅ |
| Firestore `(default)` database created, region `asia-south1` | ✅ |
| `firestore.rules` deployed (deny-all direct client access) | ✅ |
| `firestore.indexes.json` deployed | ✅ |
| Firestore data layer (`lib/store.firestore.js`) tested on emulator | ✅ |
| SQLite → Firestore migration script written + tested | ✅ |
| Hosting rewrite config (`/api/**` → function) written | ✅ |
| Cloud Function entry point (`index.js`) written and function-export tested | ✅ |
| Production Function uses Firestore + Secret Manager + asia-south1 | ✅ |
| Health endpoint + JSON API 404/error contract | ✅ |

## What is blocked

`firebase deploy --only functions` is blocked with:

```
Your project xenproperty-5944b must be on the Blaze (pay-as-you-go) plan
to complete this command. Required API cloudbuild.googleapis.com can't be
enabled until the upgrade is complete.
```

Needed for: Cloud Functions (API), Secret Manager (JWT secret), Storage (image uploads).

---

## Finish the deploy (about 10 minutes after upgrading)

### 1. Upgrade the plan

https://console.firebase.google.com/project/xenproperty-5944b/usage/details

> Blaze bills overages against a credit card. The free quota covers this app's
> traffic comfortably, but it is no longer free-of-risk.

### 2. Authenticate

```bash
firebase login
```

### 3. Create the Storage bucket (one console click)

https://console.firebase.google.com/project/xenproperty-5944b/storage → **Get Started**

Then re-add storage to `firebase.json` (it was removed so deploys would not fail
before the bucket exists):

```json
"storage": { "rules": "storage.rules" }
```

### 4. Set the JWT secret

`.secret.tmp` already holds a freshly generated 64-char random secret.

```bash
firebase functions:secrets:set xenproperty_jwt --data-file ".secret.tmp"
```

Then delete the plaintext copy:

```bash
rm .secret.tmp        # or: del .secret.tmp
```

### 5. Migrate the data

```bash
npm run migrate:firestore
```

Reads `xenproperty.sqlite` (read-only) and writes to Firestore, preserving the
existing numeric IDs. Re-running is safe — it writes a marker and skips.

### 6. Deploy

```bash
firebase deploy
```

### 7. Verify

- Site: https://xenproperty-5944b.web.app
- `admin@xenproperty.com` / `admin123`
- `rahul@xenproperty.com` / `user123`

---

## Rotate the demo passwords before real users arrive

`admin123` / `user123` are published in `README.md`. Anyone who reads the repo
can log in as admin. Change them in the app, or delete the seeded accounts.

## Local development (no Firebase needed)

```bash
npm start          # http://localhost:3000, SQLite backend
```

### Test the Firestore backend without deploying

```bash
firebase emulators:start --only firestore
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
$env:GCLOUD_PROJECT='xenproperty-5944b'
node scripts/migrate-to-firestore.js
$env:DB_PROVIDER='firestore'; npm start
```
