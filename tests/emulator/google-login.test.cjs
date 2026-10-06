// "Sign in with Google" via Align's server (Android app, iPhone home-screen app): `npm run test:emulator`.
// Google is simulated; nothing leaves the machine.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');

process.env.FIREBASE_PROJECT_ID = 'demo-align';
process.env.GCLOUD_PROJECT = 'demo-align';
process.env.GOOGLE_OAUTH_CLIENT_ID = '123456789012-testclient.apps.googleusercontent.com';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'client-secret';

const b64 = (s) => Buffer.from(s).toString('base64url');
const realFetch = global.fetch;
global.fetch = async (url, opts = {}) => {
  if (String(url) === 'https://oauth2.googleapis.com/token') {
    const idToken = ['x', b64(JSON.stringify({ sub: '1122334455', email: 'friend@gmail.com', email_verified: true, aud: process.env.GOOGLE_OAUTH_CLIENT_ID })), 'sig'].join('.');
    return new Response(JSON.stringify({ id_token: idToken, access_token: 'a' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return realFetch(url, opts);
};

const jiti = require('jiti')(__filename);
const { startGoogleLogin, finishGoogleLogin, redeemGoogleLogin } = jiti(path.join(__dirname, '../../lib/googleLogin.ts'));

const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};

test('app: Google → back to the app with a one-time code → a sign-in token, once', async () => {
  const { verifier, challenge } = pkce();
  const url = new URL(await startGoogleLogin('app', challenge));
  assert.equal(url.searchParams.get('scope'), 'openid email profile', 'basic scopes only');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://alignplanner.vercel.app/api/gmail/callback', 'the address Connect Gmail registered');
  const state = url.searchParams.get('state');
  assert.match(state, /^gl_/);
  const back = new URL(await finishGoogleLogin('auth-code', state, 'https://alignplanner.vercel.app'));
  assert.equal(`${back.protocol}//${back.host}${back.pathname}`, 'align://login');
  const code = back.searchParams.get('google');
  assert.ok(code && code.length > 30);
  // a code caught by another app is useless without this device's secret
  assert.equal(await redeemGoogleLogin(code, pkce().verifier), null);
  const token = await redeemGoogleLogin(code, verifier);
  assert.ok(typeof token === 'string' && token.length > 20);
  assert.equal(await redeemGoogleLogin(code, verifier), null, 'only once');
  // and the state can't be replayed
  assert.match(await finishGoogleLogin('auth-code', state, 'https://alignplanner.vercel.app'), /google=expired/);
});

test('web (home-screen app): comes back to /login on the site; unknown state is refused', async () => {
  const { challenge } = pkce();
  const state = new URL(await startGoogleLogin('web', challenge)).searchParams.get('state');
  assert.match(await finishGoogleLogin('auth-code', state, 'https://alignplanner.vercel.app'), /^https:\/\/alignplanner\.vercel\.app\/login\?google=[A-Za-z0-9_-]{40,}$/);
  assert.match(await finishGoogleLogin('auth-code', 'gl_made-up', 'https://alignplanner.vercel.app'), /google=expired/);
  await assert.rejects(startGoogleLogin('web', 'short'), /Bad challenge/);
});
