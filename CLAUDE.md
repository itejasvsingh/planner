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
- Gmail reads alerts only from the banks the user ticks in Settings → Gmail (`gmail_links.banks` / `extraSenders`; null =
  all of `lib/bankSenders.ts` BANKS); statements and card bills (steps 3–4 of `syncGmail`) come from every known bank plus `extraSenders`, only from the last
  3 months unless the user picks 6 or 12 (`gmail_links.statementMonths`, `statementSince` in `lib/statementAuto.ts`, POST `/api/gmail/statements` `{months}`).
  A statement password is tried on the newest locked statement before it's saved (`checkStatementPassword`, searching Gmail for one if Align has none listed); a wrong one is refused (422) with a try-again message.
  `statementPasswords.<slot>.verified` is set only when it opened a statement (on save or during a sync); the app shows "Password works" vs "not checked yet". Alerts from any bank go through `parseBankEmail` (sentence + labelled rows);
  `recordTransaction` keeps one payment from SMS/email/Gmail/statement once (same ref, or same amount and
  direction ±1 day from another source unless both refs differ) and stores `ref` and `time`.
- Wallet & accounts (`lib/moneyAccounts.ts`, `GET /api/money/accounts`): per card the latest statement
  (gmail_links/<phone>/bills, with `statementDate`), payments (`money_accounts/<phone>/card_payments`) and spends
  since it (transactions with `cardLast4`), and the latest "Avl Bal" per account (`money_accounts/<phone>/accounts`),
  parsed by `lib/accountParse.ts` from Gmail and SMS (many wordings; a currency-less "Avl Bal: 12,345.67" only when it looks like money). The
  Android app's on-device SMS filter (`modules/align-sms/.../SmsForwarder.kt`) also forwards balance-only messages; changing it needs a new APK. `money_accounts` is server-only (catch-all rule).
  The user's card changes live in `money_accounts/<phone>/card_edits/<key>` (`POST /api/money/cards`): name, last4 and
  hidden persist; amounts, due date and paid apply only while `forDue` matches the latest statement; `manual_*` keys
  are cards added by hand. The app's "Paid with" sets a transaction's `cardLast4`.
- Accounts (`GET/POST /api/money/accounts`): `saveBalance` also keeps one balance per day in
  `money_accounts/<phone>/accounts/<id>/history/<YYYY-MM-DD>` (the latest that day; ~90 days returned as `history` for the trend
  line). `account_edits/<id>` (server-only) holds the user's `excluded` tick (left out of the bank total, in `adjustBalances` so
  Overview and Cards agree) and typed bank details (`ifsc`, `accountNumber`, `holder`, shown for copying; never log them).
  A card's optional `limit` is a `card_edits` field that stays across statements (statements don't give it).
- Places: an expense can carry `place` ({lat, lng}, from "Use my location" in the transaction sheet: browser geolocation on web via
  `lib/geo.ts`, `expo-location` in the Android app via `lib/geo.native.ts`) and `placeName`. New expenses are pinned automatically where you are (`lib/auto-place.ts`, from the transaction sheet and quick-add; on by default, switch in Settings, stored on the device as `align_auto_pin`; never throws, no permission = no pin; the user can change or remove it). Named places are saved on the device only
  (`lib/places-store.ts`, AsyncStorage `align_saved_places`); no address lookup. Analysis shows the pins on a map (`components/finance/PlacesMap.tsx`, OpenStreetMap tiles drawn as plain images; only the viewed area is requested, never transactions; pins still show offline). Analysis → "Where you spend"
  groups by place or shop (`lib/places.ts`). Adding `expo-location` changed the native fingerprint, so the Android workflow builds a new APK.
- Net worth (`align-native/src/lib/net-worth.ts`, Money → Overview): ticked bank balances + custom assets − card dues − custom
  liabilities. Custom entries live in server-only `money_accounts/<phone>/net_worth/<id>` (max 50; `POST /api/money/networth`,
  returned as `entries` by `GET /api/money/accounts`). Sharing finances with other people ("Spaces") is deliberately not built.
- Transactions can be `bookmarked` and `excluded` ("leave out of cash flow": still listed, in no total: `isExpense`/`isIncome`
  in `finance-analysis.ts`, overview90, the WhatsApp daily summary). Account balances still count them (the money moved).

- Statement PDFs (`lib/statementAuto.ts`, step 4 of `syncGmail`, `/api/gmail/statements`): the user saves a bank's PDF
  password per kind (sealed with `GMAIL_TOKEN_KEY` in `gmail_links.statementPasswords.<bank>` for account statements,
  `<bank>__card` for credit card statements; never returned); each sync opens
  up to two new statement PDFs, records rows with the same doc ids as manual import (no duplicates) and the closing
  balance. A locked file is retried only after that bank's password changes (`statementTried`). Once open, the PDF decides
  card vs account (`kindFromPdf` in `lib/statementParse.ts`, beats the email's wording, also corrects `statementIndex`) and the
  card/account number; a card statement's own summary is saved as the bill (`parseCardBill` reads label-row/value-row tables like
  HDFC's and co-brand names like "Swiggy"). Statements imported before this are reopened once for the bill only (`statementBillIds5`; the name is bumped whenever bill reading improves, so every statement is reopened once more). Statement summaries
  are read by meaning and position, not per bank (words like total+due, min+due, due+date; wrapped labels; decoys such as previous/current dues skipped;
  min ≤ total; due date within ~2 months): no new bank should need a code change. A statement where nothing credible is found says so in Wallet. Box layouts
  (HDFC) are read by position: `summaryFromItems` in `lib/statementParse.ts` puts "Label: value" lines first in the PDF text.
- Split cashback (`ExpenseSplit.cashback`, set in the split form, `buildSplit` in `align-native/src/lib/splits.ts`): rupees or % of the total;
  'share' lowers everyone's share in proportion (someone who already paid keeps `paid` = what they paid, so the difference shows as owed back),
  'keep' lowers only the payer's own cost (no effect on you when a friend paid).
- Transfers: `expenseCategories.transferMerchants` (payee → Family / Self Transfer) and "self / own a/c" wording
  (`SELF_TRANSFER`) make `recordTransaction` save money-out as type `transfer`, before the duplicate check.
- Suspicious payments are found in the app (`align-native/src/lib/suspicious.ts`, pure): Money shows "payments to
  check" and `SuspiciousWatcher` notifies once per new one; the answer is stored as the item's `review`.
- Wallet → Statements (`components/finance/StatementsCard.tsx`): asks for missing/wrong PDF passwords inline (StatementPasswords
  `mode="pending"`), searches Gmail for statements at most daily (`statementIndexAt`), and summarises each statement read
  (`money_accounts/<phone>/statements/<msgId>`, written by `syncGmail` step 4) on the phone with `lib/statement-summary.ts` (rules only,
  no AI): spent/received, top categories and shops, biggest, change vs the previous one; the newest card statement shows what's due
  and a per-card "Remind me".
- Closed cards: `card_edits.closed` (Wallet → card → "This card is closed") or `gmail_links.closedBanks` (Settings → Gmail → statements,
  "Card closed?" for a bank with no card in Wallet yet). `syncClosedCards` mirrors them into `gmail_links.closedCards`/`closedIssuers`,
  ticks off their bill tasks and clears their statement status; `isClosedCard` makes the Gmail sync skip their bills and statements.
- Card due reminders use what's owed now (`cardReminderLines` in `lib/moneyAccounts.ts` for WhatsApp; the app's
  `NotificationsManager` schedules them locally); per card `remind` in card_edits, else `gmail_links.billReminders`.
- After each statement, rows are compared with alert-recorded transactions of the same `accountLast4`/`cardLast4`;
  ones missing from the statement are stored as `statementStatus.<slot>.extras` and shown in Wallet.
- Security: the repo is public. Never commit tokens or keys (the history already holds old WhatsApp/Meta tokens, a
  Gemini key and old NUDGE/TEST_SUMMARY secrets, which must stay revoked). `/api/parse` is signed-in only and writes
  only to the caller's own account; cron routes accept only `CRON_SECRET` and reply with counts, never personal
  data; the WhatsApp webhook verifies Meta's `X-Hub-Signature-256` once `WHATSAPP_APP_SECRET` is set.
- Google sign-in: a pop-up in browsers; in the Android app and the home-screen web app it goes through the server
  (`lib/googleLogin.ts`, `/api/auth/google/start|finish`, sharing `/api/gmail/callback` via state `gl_…`): one-time
  code + PKCE verifier → custom token `google_<sub>`, then the number is linked with a WhatsApp code as usual.
- Card bill reminders (`lib/cardBills.ts`) are opt-in: bills are stored server-only; Agenda tasks
  (`kind: 'card_bill'`, never auto-pushed) and WhatsApp summary lines exist only after the user says yes.
- AI provider (`lib/ai.ts`, `generateJson`): `AI_PROVIDER` = `gemini` (default) or `anthropic` (Claude Haiku 5.5, official SDK, no
  temperature, effort low); `ANTHROPIC_API_KEY` / `GEMINI_API_KEY`. The chosen provider answers first and the other
  (when its key exists) backs it up if it fails or gives nothing usable. Only `/api/parse` (quick add) uses it so far; the
  WhatsApp bot and the SMS route still call Gemini directly. The privacy page names both providers. Emails and Gmail data
  must never be passed to `generateJson`. Look for "parse answered by <provider>" in the logs.
