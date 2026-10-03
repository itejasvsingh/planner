const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const alignNativeDir = path.join(rootDir, 'align-native');
const distDir = path.join(alignNativeDir, 'dist');
const publicDir = path.join(rootDir, 'public');
const webTargetDir = path.join(publicDir, '_web');

console.log('--- Step 1: Exporting align-native for web ---');
const hasAlignNodeModules = fs.existsSync(path.join(alignNativeDir, 'node_modules'));
if (!process.env.VERCEL && hasAlignNodeModules) {
  try {
    execSync('EXPO_NO_TELEMETRY=1 npx expo export -p web', {
      cwd: alignNativeDir,
      stdio: 'inherit',
      env: { ...process.env, EXPO_NO_TELEMETRY: '1' }
    });
  } catch (err) {
    console.error('Expo export failed; refusing to publish stale assets:', err.message);
    process.exit(1);
  }
} else {
  console.log('Using pre-bundled align-native web artifacts.');
}

if (!fs.existsSync(distDir)) {
  if (!fs.existsSync(path.join(webTargetDir, 'index.html'))) {
    console.error('No web export found. Install align-native dependencies and run npm run export:web.');
    process.exit(1);
  }
  console.log('Using pre-committed public web assets.');
  process.exit(0);
}

console.log('--- Step 2: Preparing public directories ---');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}
if (!fs.existsSync(webTargetDir)) {
  fs.mkdirSync(webTargetDir, { recursive: true });
}

// Copy _expo folder to public/_expo
const expoSource = path.join(distDir, '_expo');
const expoTarget = path.join(publicDir, '_expo');
if (fs.existsSync(expoSource)) {
  console.log('Syncing _expo assets...');
  fs.cpSync(expoSource, expoTarget, { recursive: true });
}

// Copy assets folder to public/assets
const assetsSource = path.join(distDir, 'assets');
const assetsTarget = path.join(publicDir, 'assets');
if (fs.existsSync(assetsSource)) {
  console.log('Syncing assets folder...');
  fs.cpSync(assetsSource, assetsTarget, { recursive: true });
}

// PWA, iOS Native & Dynamic Island snippet to inject into <head> of HTML files
const pwaHeadSnippet = `
  <!-- iOS Native & Dynamic Island Optimization -->
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Align">
  <meta name="theme-color" content="#0E0D14">
  <meta name="format-detection" content="telephone=no">
  <meta name="apple-touch-fullscreen" content="yes">
  <link rel="manifest" href="/manifest.json">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
  <link rel="apple-touch-icon" sizes="152x152" href="/icon-192.png">
  <link rel="apple-touch-startup-image" href="/icon-512.png">

  <style>
    :root {
      --sat: env(safe-area-inset-top, 0px);
      --sab: env(safe-area-inset-bottom, 0px);
      --sal: env(safe-area-inset-left, 0px);
      --sar: env(safe-area-inset-right, 0px);
    }
    html, body {
      margin: 0;
      padding: 0;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      height: 100%;
      overscroll-behavior-y: none;
      -webkit-tap-highlight-color: transparent;
      -webkit-font-smoothing: antialiased;
      -webkit-touch-callout: none;
      user-select: none;
      -webkit-user-select: none;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif;
      overflow: hidden;
      /* Scrolling only: no pinch zoom (Android Chrome) or double-tap zoom and its tap delay */
      touch-action: pan-x pan-y;
      overscroll-behavior: none;
      -webkit-text-size-adjust: 100%;
      text-size-adjust: 100%;
    }
    #root {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    input, textarea {
      user-select: auto;
      -webkit-user-select: auto;
    }
    input, textarea, select { font-size: 16px; }
    :focus-visible { outline: 2px solid #7F3DFF; outline-offset: 3px; }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
    }
    /* iOS standalone bug: the window is laid out safe-area-top shorter than the screen but drawn from y=0,
       so the bottom strip stays unpainted. Fixed-position boxes don't extend the document, so give it real
       (in-flow) height to the full screen. Toggled by the script below only when the bug is detected. */
    html.ios-gap-fix, html.ios-gap-fix body {
      position: relative;
      top: auto;
      bottom: auto;
      height: var(--ios-fill-h);
    }
    html.ios-gap-fix #root {
      bottom: auto;
      height: var(--ios-fill-h);
    }
    /* iOS Install banner styling */
    #ios-install-banner {
      position: fixed;
      bottom: calc(72px + env(safe-area-inset-bottom, 0px));
      left: 16px;
      right: 16px;
      max-width: 440px;
      margin: 0 auto;
      background: rgba(24, 23, 31, 0.97);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid #2A2933;
      border-radius: 22px;
      padding: 16px 18px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
      z-index: 999999;
      display: none;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      animation: iosBannerSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes iosBannerSlideUp {
      from { transform: translateY(120px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  </style>

  <script>
    // iOS Safari ignores user-scalable=no: stop pinch zoom so the app stays put
    ['gesturestart', 'gesturechange'].forEach(function (t) {
      document.addEventListener(t, function (e) { e.preventDefault(); }, { passive: false });
    });
  </script>

  <script>
    // iOS standalone bottom-gap workaround (see .ios-gap-fix above)
    (function() {
      var mq = window.matchMedia && window.matchMedia('(display-mode: standalone)');
      if (!(window.navigator.standalone === true || (mq && mq.matches))) return;
      if (!/iPhone|iPad|iPod/.test(navigator.userAgent)) return;
      var on = false;
      // Decide from sizes only (the safe-area inset can still read 0 this early when opening from the
      // offline cache). Once on, stay on until landscape: applying the fix changes the reported sizes, and
      // re-deciding from those made the layout flip back and forth.
      function fit() {
        var de = document.documentElement;
        var portrait = window.innerWidth < window.innerHeight;
        if (!portrait) {
          if (on) { de.classList.remove('ios-gap-fix'); on = false; }
          return;
        }
        if (on) return;
        var full = Math.max(window.screen.height, window.screen.width);
        if (window.innerHeight <= full - 40) {
          de.style.setProperty('--ios-fill-h', full + 'px');
          de.classList.add('ios-gap-fix');
          on = true;
        }
      }
      // The taller document can scroll by the gap height; keep it pinned unless an input is being edited
      function unscroll() {
        var a = document.activeElement;
        if ((window.scrollY || window.scrollX) && !(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) window.scrollTo(0, 0);
      }
      fit();
      document.addEventListener('DOMContentLoaded', fit);
      window.addEventListener('load', fit);
      window.addEventListener('pageshow', fit);
      window.addEventListener('orientationchange', function() { setTimeout(fit, 300); });
      window.addEventListener('scroll', unscroll, { passive: true });
      document.addEventListener('focusout', function() { setTimeout(unscroll, 50); });
    })();

    // URL phone login helper
    try {
      var params = new URLSearchParams(window.location.search);
      var phoneParam = params.get('phone');
      if (phoneParam) {
        localStorage.setItem('planner_user_phone', phoneParam);
      }
    } catch(e) {}

    // Auto-updater for iOS Standalone PWA
    (function() {
      var isStandalone = window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
      if (isStandalone) {
        fetch('/?_cb=' + Date.now(), { cache: 'no-store' })
          .then(function(r) { return r.text(); })
          .then(function(html) {
            var m = html.match(/entry-([a-f0-9]+)\.js/);
            if (m && m[0] && !document.documentElement.innerHTML.includes(m[0])) {
              window.location.reload(true);
            }
          })
          .catch(function() {});
      }
    })();

    // Cache purger
    if ('caches' in window) {
      caches.keys().then(function(keys) {
        keys.forEach(function(k) {
          if (k.includes('next') || k.includes('workbox') || k.includes('pages')) {
            caches.delete(k);
          }
        });
      });
    }
    // Offline support: register the service worker (it caches the app shell; see Step 4 of prepare-expo-web.js).
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js').then(function(reg) { return reg.update(); }).catch(function() {});
      });
    }

    // iOS Install to Home Screen Prompt Logic
    document.addEventListener('DOMContentLoaded', function() {
      var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      var isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
      var dismissed = sessionStorage.getItem('dismiss_ios_install') === 'true';

      if (isIOS && !isStandalone && !dismissed) {
        var banner = document.getElementById('ios-install-banner');
        if (banner) {
          banner.style.display = 'block';
        }
      }
    });

    function dismissIosInstall() {
      sessionStorage.setItem('dismiss_ios_install', 'true');
      var banner = document.getElementById('ios-install-banner');
      if (banner) banner.style.display = 'none';
    }
  </script>
`;

const iosBannerHtml = `
<div id="ios-install-banner">
  <div style="display:flex; align-items:flex-start; gap:14px;">
    <img src="/apple-touch-icon.png" style="width:48px; height:48px; border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,0.3); flex-shrink:0;" />
    <div style="flex:1;">
      <div style="font-weight:700; font-size:15px; color:#FFFFFF; margin-bottom:4px;">Install Align on iOS</div>
      <div style="font-size:13px; color:#B4B4C4; line-height:1.45;">
        Keep your planner a tap away:
        <div style="margin-top:6px; font-weight:500; color:#FFFFFF;">
          1. Tap <strong>Share</strong> <span style="display:inline-block; font-size:15px;">⎋</span> at the bottom
          <br>
          2. Tap <strong>Add to Home Screen ⊞</strong>
        </div>
      </div>
    </div>
    <button onclick="dismissIosInstall()" style="background:none; border:none; color:#8E8EA3; font-size:20px; line-height:1; padding:2px 6px; cursor:pointer;">✕</button>
  </div>
  <div style="margin-top:14px; display:flex; justify-content:flex-end; gap:8px;">
    <button onclick="dismissIosInstall()" style="background:#7F3DFF; color:#FFFFFF; border:none; border-radius:16px; padding:8px 18px; font-weight:700; font-size:13px; cursor:pointer;">Got It</button>
  </div>
</div>
`;

function processHtmlFile(sourcePath, targetPath) {
  let content = fs.readFileSync(sourcePath, 'utf8');

  // Replace viewport with complete iOS cover attributes
  content = content.replace(
    /<meta name="viewport"[^>]*>/,
    // An app, not a document: no pinch/double-tap zoom, and iOS doesn't zoom in when a text box is focused.
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />'
  );

  // Inject PWA snippet before </head> if not present
  if (!content.includes('apple-mobile-web-app-title')) {
    content = content.replace('</head>', `${pwaHeadSnippet}</head>`);
  }

  // Inject iOS Banner before </body> if not present
  if (!content.includes('id="ios-install-banner"')) {
    content = content.replace('</body>', `${iosBannerHtml}</body>`);
  }

  const targetDir = path.dirname(targetPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  fs.writeFileSync(targetPath, content, 'utf8');
}

console.log('--- Step 3: Copying and enhancing HTML files ---');
function copyHtmlFiles(dir, relativePath = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullSource = path.join(dir, entry.name);
    const rel = path.join(relativePath, entry.name);
    if (entry.isDirectory() && entry.name !== '_expo' && entry.name !== 'assets') {
      copyHtmlFiles(fullSource, rel);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      // Write to public/_web/<rel>
      const destInWeb = path.join(webTargetDir, rel);
      processHtmlFile(fullSource, destInWeb);

      // Also copy root index.html to public/index.html
      if (rel === 'index.html') {
        processHtmlFile(fullSource, path.join(publicDir, 'index.html'));
      }
    }
  }
}
copyHtmlFiles(distDir);

console.log('--- Step 4: Writing offline-capable service worker ---');
// The app shell (HTML, the hashed JS/CSS bundles, icons) is cached so the web app and home-screen app open
// without a connection. Pages are network-first, so online users always get the latest deploy; hashed bundles
// are cache-first because their names change on every build. Each build gets its own cache (named after the
// bundle hash) and older caches are deleted when it activates. Data (Firestore), /api and other origins are
// never cached; offline writes are handled in the app (src/lib/outbox.ts).
const indexHtml = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const shellAssets = Array.from(new Set(
  (indexHtml.match(/\/_expo\/static\/(?:js|css)\/[^"']+\.(?:js|css)/g) || [])
));
const buildId = (shellAssets.find((a) => a.includes('/entry-')) || String(Date.now())).replace(/^.*entry-|\.js$/g, '').slice(0, 12);
const precache = ['/', '/manifest.json', '/favicon.ico', ...shellAssets];
const swContent = `// Align service worker (build ${buildId}). Generated by scripts/prepare-expo-web.js.
const CACHE = 'align-shell-${buildId}';
const PRECACHE = ${JSON.stringify(precache)};

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // One missing optional file must not block install.
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Pages: latest from the network, saved copy when offline (any route falls back to the app shell).
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('/')))
    );
    return;
  }

  // Hashed bundles never change: cache first.
  if (url.pathname.startsWith('/_expo/static/')) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
        return res;
      }))
    );
    return;
  }

  // Other same-origin files (icons, fonts, images): serve saved copy, refresh in the background.
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
`;
fs.writeFileSync(path.join(publicDir, 'sw.js'), swContent, 'utf8');
console.log(`Service worker: build ${buildId}, ${precache.length} files precached`);

console.log('--- Step 5: Export and sync complete! ---');

