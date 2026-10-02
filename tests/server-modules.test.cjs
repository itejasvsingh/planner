const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

// Vercel's function runtime can't require() ES modules (ERR_REQUIRE_ESM), unlike local Node 24. firebase-admin 14
// pulls in jwks-rsa 4 → jose 6 (ESM-only) and broke every API route in production; keep server deps loadable
// with that ability switched off.
for (const mod of ['firebase-admin/app', 'firebase-admin/auth', 'firebase-admin/firestore']) {
  test(`${mod} loads without require(esm)`, () => {
    const r = spawnSync(process.execPath, ['--no-experimental-require-module', '-e', `require(${JSON.stringify(mod)})`], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr.split('\n').find(l => /Error/.test(l)) || r.stderr);
  });
}
