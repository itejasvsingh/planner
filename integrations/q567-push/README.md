# Class timetable: q567 → Align

Align shows your q567 classes (Agenda and Calendar, read-only, with cancellations and moves). It never connects to
q567: a small job in the q567 project sends the data, and Align only accepts it with a secret.

## 1. In Vercel (the Align project): two new environment variables
- `Q567_PUSH_SECRET`: a long random string you make (`openssl rand -hex 32`). Keep it out of chat and git.
- `Q567_OWNER_PHONE`: your Align phone number (the one you sign in with). Only this number sees the timetable.

Redeploy. Until both exist, the feature stays off and invisible.

## 2. In the q567 project: send it on a schedule (every 15 minutes; GitHub may run it a few minutes late)
Copy `push.cjs` into the q567 repo (e.g. `scripts/push-to-align.cjs`) and add this workflow as `.github/workflows/push-to-align.yml`:

```yaml
name: Push timetable to Align
on:
  schedule: [{ cron: '*/15 * * * *' }]
  workflow_dispatch:
jobs:
  push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm i firebase-admin
      - run: node scripts/push-to-align.cjs
        env:
          Q567_SERVICE_ACCOUNT: ${{ secrets.Q567_SERVICE_ACCOUNT }}
          Q567_ROLL: MS25A071
          ALIGN_URL: https://alignplanner.vercel.app
          ALIGN_PUSH_SECRET: ${{ secrets.ALIGN_PUSH_SECRET }}
```

Add two **repository secrets** in the q567 repo: `Q567_SERVICE_ACCOUNT` (the q567mba service-account JSON) and
`ALIGN_PUSH_SECRET` (the same value as `Q567_PUSH_SECRET` above). Try it first on your Mac with `node push.cjs --dry`.

## What is sent
Only the sheet's class slots, the shared updates (without who posted them), your Q6 elective course codes and the
sessions you hid. Align cleans it again on arrival (`sanitizeQ567Push`) and keeps it in a server-only collection.

## Each term
Update `Q6_SUBJECTS` in `lib/q567.ts` (course codes, names, rooms) and `selections.Q6` in `push.cjs` to the new term.
