# If something goes wrong (data leak, stolen key, misuse)

A short checklist for the owner. Nothing here is a secret. Never put keys or personal data in this file or in chat.

## 1. Stop it (first hour)
- **A key or token leaked** (Vercel variable, Firebase service account, WhatsApp/Meta token, Gmail OAuth secret, `GMAIL_TOKEN_KEY`, VAPID private key, SMTP app password, `TEST_LOGINS` codes): make a new one and replace it in Vercel, delete the old one at its source, redeploy.
  - Firebase: Google Cloud Console, IAM and Admin, Service accounts, delete the old key and make a new one.
  - Meta: WhatsApp Manager / developer app, regenerate the access token; check recent activity.
  - Google (Gmail): OAuth client, reset the secret; users are asked to reconnect.
  - Gmail app password: myaccount.google.com/apppasswords, delete it, make a new one.
  - Push (VAPID): make a new pair (`npx web-push generate-vapid-keys`); people turn notifications on again.
  - `TEST_LOGINS`: delete the variable and redeploy.
- **A phone or sign-in stolen:** there is no "sign out everywhere" button yet. In Firebase Console, Authentication, disable or delete that person's sign-in so the stolen phone stops working, then let them sign in again.
- **Something looks wrong in the database:** stop the cause first (remove the bad key, turn off the route), then look at Vercel logs and the Firestore console.

## 2. Find out what happened
- Vercel, the project, Logs: look for the time window. Firebase Console, Firestore usage and Authentication activity.
- Write down: what was exposed, whose data, since when, how it was found. Keep it short and dated.
- Remember the repo is public: anything ever committed there is public. Old tokens in its history (WhatsApp/Meta, a Gemini key, old NUDGE/TEST_SUMMARY secrets) must stay revoked.

## 3. Tell people (as soon as you know)
- Tell the affected people what happened, what data, what you did, and what they should do (for example change a bank password if a statement password was exposed). Plain words, no blame.
- India's DPDP Act requires telling affected people and the Data Protection Board of India. The detailed timing and form are in the final Rules (check the Gazette text, or ask a lawyer); duties for small apps start in 2027 but telling people early is right.
- If bank or card details of someone were exposed, tell them to watch statements and contact their bank.

## 4. Fix and learn
- Fix the cause, add a test if it was code, and note in CLAUDE.md what to never do again.
- Revisit this list. Update the privacy page if what you collect changed.

## Where the data is
Firestore (Google Cloud) for items, balances, cards, settings; Firebase Auth for sign-ins; Vercel for the server; Meta for WhatsApp; Google for Gmail access (read-only, the key is sealed with `GMAIL_TOKEN_KEY`). Users can download or delete their own data in Settings, Your data.
