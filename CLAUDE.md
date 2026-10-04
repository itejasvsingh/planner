@AGENTS.md

## Deploying

- Vercel deploys `main` to production. The owner wants finished changes pushed straight to `main`
  (no PR needed), after type-checking and running the tests that cover the change.
- Exception: anything that breaks production until new env vars or manual setup exist
  (e.g. secrets in Vercel, Firebase console steps) goes on a branch/PR and the owner is told what to set first.
- The web app is a pre-built Expo export committed under `public/`. After changing `align-native/src`,
  rebuild with `node scripts/prepare-expo-web.js` (needs `align-native/node_modules`) and commit the output.
- Firestore rules deploy automatically from `.github/workflows/firestore-rules.yml` when `firestore.rules` changes on `main`.
- Android APK (Expo project `@itejasv/align-native`, id `3bbcf086-…` in app.json; `owner` must stay `itejasv`):
  `.github/workflows/android.yml` runs on GitHub's runners on every push to `main` that touches `align-native/`.
  If an APK with the same native fingerprint exists (GitHub Release `android-<hash>` or an EAS build) it runs
  `eas update` to the `preview` channel; otherwise it builds the APK on the runner (`eas build --local`) and attaches
  it to a new GitHub Release for the owner to install once. Needs the `EXPO_TOKEN` repo secret. Build-time
  `EXPO_PUBLIC_*` values come from the EAS `preview` environment, not `.env`. (EAS Workflows were dropped: the
  free-plan queue held jobs for hours.)
## Data access and sign-in

- Firestore rules are owner-only. The app reaches data only when signed in to Firebase: WhatsApp-number users
  through `/api/auth/code` + `/api/auth/verify` (a code sent on WhatsApp; the custom token's `phones` claim lists
  the number's spellings, matched against `ownerId`), Google users after verifying a number the same way.
  Never add client writes of `users/<uid>.phone` or rules that allow signed-out access.
- Server code (API routes, crons, the WhatsApp bot) uses the Admin SDK (`lib/firebase.ts`), which needs
  `FIREBASE_SERVICE_ACCOUNT` (service-account JSON, raw or base64) in Vercel. Server-only collections:
  `rate_limits`, `auth_codes` and anything not matched in `firestore.rules`.
- Login codes: `WHATSAPP_AUTH_TEMPLATE` (approved Meta "Authentication" template with a copy-code button) makes
  them arrive any time; without it they go as plain messages, delivered only within 24 h of the user messaging Align.
- `npm run test:emulator` runs the rules and sign-in tests against the Firebase emulators (project `demo-align`;
  needs Java). The app can be pointed at the emulators with `EXPO_PUBLIC_FIREBASE_EMULATOR=127.0.0.1` and
  `EXPO_PUBLIC_FIREBASE_PROJECT_ID=demo-align` for local end-to-end runs; never set these for a release build.
- Connected Gmail (`lib/gmail.ts`, `/api/gmail/*`, Settings → Gmail): read-only OAuth; the refresh token is sealed
  with `GMAIL_TOKEN_KEY` (AES-GCM, `lib/secretBox.ts`) in server-only `gmail_links/<phone>`. Only bank senders
  (`lib/bankSenders.ts`, mirrored in the app's Gmail script) are read; alerts go through `lib/emailAlert.ts` +
  `lib/recordTransaction.ts` (shared dedupe with SMS). Gmail/email data must never be sent to Gemini or stored
  verbatim (promised in /privacy). `.github/workflows/gmail-sync.yml` calls `/api/gmail/sync-all` every 15 min
  with `GMAIL_SYNC_SECRET`. Env: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GMAIL_TOKEN_KEY`,
  `GMAIL_SYNC_SECRET`. The OAuth app is unverified (100-user lifetime cap); test with your own Google account.
- Vercel functions can't require() ESM-only packages (see tests/server-modules.test.cjs); before shipping
  server dependencies, load built routes with `node --no-experimental-require-module`.
- Gmail reads only the banks the user ticks in Settings → Gmail (`gmail_links.banks` / `extraSenders`; null =
  all of `lib/bankSenders.ts` BANKS). Alerts from any bank go through `parseBankEmail` (sentence + labelled rows);
  `recordTransaction` keeps one payment from SMS/email/Gmail/statement once (same ref, or same amount and
  direction ±1 day from another source unless both refs differ) and stores `ref` and `time`.
- Money → Cards & accounts (`lib/moneyAccounts.ts`, `GET /api/money/accounts`): per card the latest statement
  (gmail_links/<phone>/bills, with `statementDate`), payments (`money_accounts/<phone>/card_payments`) and spends
  since it (transactions with `cardLast4`), and the latest "Avl Bal" per account (`money_accounts/<phone>/accounts`),
  parsed by `lib/accountParse.ts` from Gmail and SMS. `money_accounts` is server-only (catch-all rule).
  The user's card changes live in `money_accounts/<phone>/card_edits/<key>` (`POST /api/money/cards`): name, last4 and
  hidden persist; amounts, due date and paid apply only while `forDue` matches the latest statement; `manual_*` keys
  are cards added by hand. The app's "Paid with" sets a transaction's `cardLast4`.
- Statement PDFs (`lib/statementAuto.ts`, step 4 of `syncGmail`, `/api/gmail/statements`): the user saves a bank's PDF
  password per kind (sealed with `GMAIL_TOKEN_KEY` in `gmail_links.statementPasswords.<bank>` for account statements,
  `<bank>__card` for credit card statements; never returned); each sync opens
  up to two new statement PDFs, records rows with the same doc ids as manual import (no duplicates) and the closing
  balance. A locked file is retried only after that bank's password changes (`statementTried`).
- Transfers: `expenseCategories.transferMerchants` (payee → Family / Self Transfer) and "self / own a/c" wording
  (`SELF_TRANSFER`) make `recordTransaction` save money-out as type `transfer`, before the duplicate check.
- Suspicious payments are found in the app (`align-native/src/lib/suspicious.ts`, pure): Money shows "payments to
  check" and `SuspiciousWatcher` notifies once per new one; the answer is stored as the item's `review`.
- Card due reminders use what's owed now (`cardReminderLines` in `lib/moneyAccounts.ts` for WhatsApp; the app's
  `NotificationsManager` schedules them locally); per card `remind` in card_edits, else `gmail_links.billReminders`.
- After each statement, rows are compared with alert-recorded transactions of the same `accountLast4`/`cardLast4`;
  ones missing from the statement are stored as `statementStatus.<slot>.extras` and shown in Money → Cards.
- Security: the repo is public. Never commit tokens or keys (the history already holds old WhatsApp/Meta tokens, a
  Gemini key and old NUDGE/TEST_SUMMARY secrets, which must stay revoked). `/api/parse` is signed-in only and writes
  only to the caller's own account; cron routes accept only `CRON_SECRET` and reply with counts, never personal
  data; the WhatsApp webhook verifies Meta's `X-Hub-Signature-256` once `WHATSAPP_APP_SECRET` is set.
- Card bill reminders (`lib/cardBills.ts`) are opt-in: bills are stored server-only; Agenda tasks
  (`kind: 'card_bill'`, never auto-pushed) and WhatsApp summary lines exist only after the user says yes.
