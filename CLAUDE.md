@AGENTS.md

## Deploying

- Vercel deploys `main` to production. The owner wants finished changes pushed straight to `main`
  (no PR needed), after type-checking and running the tests that cover the change.
- Exception: anything that breaks production until new env vars or manual setup exist
  (e.g. secrets in Vercel, Firebase console steps) goes on a branch/PR and the owner is told what to set first.
- The web app is a pre-built Expo export committed under `public/`. After changing `align-native/src`,
  rebuild with `node scripts/prepare-expo-web.js` (needs `align-native/node_modules`) and commit the output.
- Firestore rules deploy automatically from `.github/workflows/firestore-rules.yml` when `firestore.rules` changes on `main`.
- Android APK (Expo project `@itejasv-team/align`, linked to this repo with base directory `align-native`):
  `.eas/workflows/deploy-android.yml` (repo root; Expo reads workflows there) runs on every push to `main`. If native code changed
  (new fingerprint) it builds a new preview APK; otherwise it publishes an OTA update to the `preview` channel
  that installed APKs pick up on next launch. Native changes need users to install the new APK.
