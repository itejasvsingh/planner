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
