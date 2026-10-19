const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../align-native/src/lib/places.ts'), 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
const P = mod.exports;
const { distanceM, nearestPlace, mapsUrl, spendByPlace, spendByShop, spotCentre, isLatLng } = mod.exports;

const here = { lat: 12.9716, lng: 77.5946 };
const near = { lat: 12.9720, lng: 77.5950 }; // about 60 m
const far = { lat: 12.9816, lng: 77.6046 }; // about 1.5 km

test('distance in metres', () => {
  assert.ok(Math.abs(distanceM(here, near) - 60) < 15, String(distanceM(here, near)));
  assert.ok(Math.abs(distanceM(here, far) - 1540) < 60);
  assert.equal(Math.round(distanceM(here, here)), 0);
});

test('nearest saved place within the radius, closest wins', () => {
  const saved = [{ id: '1', name: 'Office', ...here }, { id: '2', name: 'Cafe', ...near }, { id: '3', name: 'Mall', ...far }];
  assert.equal(nearestPlace(saved, { lat: 12.97195, lng: 77.59495 }).name, 'Cafe');
  assert.equal(nearestPlace(saved, here).name, 'Office');
  assert.equal(nearestPlace(saved, { lat: 13.5, lng: 78 }), null);
  assert.equal(nearestPlace([], here), null);
});

test('pins are validated and the maps link is a plain https URL', () => {
  assert.equal(isLatLng({ lat: 1, lng: 2 }), true);
  assert.equal(isLatLng({ lat: NaN, lng: 2 }), false);
  assert.equal(isLatLng('x'), false);
  assert.equal(mapsUrl(here), 'https://www.google.com/maps/search/?api=1&query=12.971600,77.594600');
});

test('spending by place: named places by name, unnamed pins by ~200 m spot, no pin skipped', () => {
  const items = [
    { id: 'a', title: 'Lunch', amount: 300, placeName: 'Office', place: here },
    { id: 'b', title: 'Chai', amount: 20, placeName: 'office', place: near },
    { id: 'c', title: 'Movie', amount: 500, place: far },
    { id: 'd', title: 'Popcorn', amount: 250, place: { lat: far.lat + 0.0003, lng: far.lng } },
    { id: 'e', title: 'Swiggy', amount: 400 },
    { id: 'f', title: 'Taxi', amount: 90, place: { lat: 13.2, lng: 77.9 } },
  ];
  const r = spendByPlace(items);
  assert.deepEqual(r.map(s => [s.name, s.total, s.count, s.named]), [['Unnamed spot', 750, 2, false], ['Office', 320, 2, true], ['Unnamed spot', 90, 1, false]]);
  assert.deepEqual(r[0].ids, ['c', 'd']);
  const c = spotCentre(items, r[0].ids);
  assert.ok(Math.abs(c.lat - (far.lat + 0.00015)) < 1e-6);
  assert.equal(spotCentre(items, ['e']), null);
});

test('spending by shop: spelled alike counts together; the commonest spelling is shown', () => {
  const r = spendByShop([
    { id: '1', title: 'Swiggy', amount: 250 }, { id: '2', title: 'SWIGGY ', amount: 150 }, { id: '3', title: 'Swiggy 123456', amount: 100 },
    { id: '4', title: 'Chai shop', amount: 20 }, { id: '5', title: '', amount: 999 },
  ]);
  assert.deepEqual(r.map(s => [s.name, s.total, s.count]), [['Swiggy', 500, 3], ['Chai shop', 20, 1]]);
});

test('map maths: fit, project and tiles', () => {
  const pts = [{ lat: 12.97, lng: 77.59 }, { lat: 12.99, lng: 77.62 }];
  const { center, zoom } = P.fitView(pts, 320, 240);
  assert.ok(zoom >= 11 && zoom <= 16);
  for (const p of pts) { const v = P.pointInView(p, center, zoom, 320, 240); assert.ok(v.x >= 0 && v.x <= 320 && v.y >= 0 && v.y <= 240); }
  const c = P.pointInView(center, center, zoom, 320, 240);
  assert.ok(Math.abs(c.x - 160) < 0.01 && Math.abs(c.y - 120) < 0.01);
  const back = P.fromWorldPx(...Object.values(P.worldPx(pts[0], 10)), 10);
  assert.ok(Math.abs(back.lat - pts[0].lat) < 1e-6 && Math.abs(back.lng - pts[0].lng) < 1e-6);
  const tiles = P.tilesFor(center, zoom, 320, 240);
  assert.ok(tiles.length >= 4 && tiles.every(t => t.x >= 0 && t.y >= 0));
  assert.equal(P.fitView([pts[0]], 320, 240).zoom, 17);
  assert.deepEqual(P.fitView([], 320, 240).zoom, 4);
});
