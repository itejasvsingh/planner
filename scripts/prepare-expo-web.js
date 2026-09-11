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
    console.warn('Warning during expo export:', err.message);
  }
} else {
  console.log('Using pre-bundled align-native web artifacts.');
}

if (!fs.existsSync(distDir)) {
  console.log('align-native/dist does not exist. Using pre-committed public web assets.');
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
  <meta name="theme-color" content="#0F172A">
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
      background-color: #0F172A !important;
      overscroll-behavior-y: none;
      -webkit-tap-highlight-color: transparent;
      -webkit-touch-callout: none;
      -webkit-font-smoothing: antialiased;
      user-select: none;
      -webkit-user-select: none;
      height: 100%;
      height: 100dvh;
      width: 100%;
      position: fixed;
      overflow: hidden;
    }
    #root {
      height: 100%;
      height: 100dvh;
      width: 100%;
      display: flex;
      flex-direction: column;
      background-color: #0F172A;
    }
    /* Prevent iOS auto-zoom on inputs */
    input, textarea, select {
      user-select: auto !important;
      -webkit-user-select: auto !important;
      font-size: 16px !important;
    }
    /* Bottom tab bar and label preservation on iOS */
    div[role="tablist"] {
      overflow: visible !important;
    }
    div[role="tab"] {
      overflow: visible !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
    }
    div[role="tab"] > div,
    div[role="tab"] span {
      overflow: visible !important;
    }
    /* iOS Install banner styling */
    #ios-install-banner {
      position: fixed;
      bottom: calc(72px + env(safe-area-inset-bottom, 0px));
      left: 16px;
      right: 16px;
      max-width: 440px;
      margin: 0 auto;
      background: rgba(15, 23, 42, 0.96);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 20px;
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
    // URL phone login helper
    try {
      var params = new URLSearchParams(window.location.search);
      var phoneParam = params.get('phone');
      if (phoneParam) {
        localStorage.setItem('planner_user_phone', phoneParam);
      }
    } catch(e) {}

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
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(regs) {
        for (var r of regs) r.update();
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
      <div style="font-size:13px; color:#94A3B8; line-height:1.45;">
        For full screen & Dynamic Island experience:
        <div style="margin-top:6px; font-weight:500; color:#E2E8F0;">
          1. Tap <strong>Share</strong> <span style="display:inline-block; font-size:15px;">⎋</span> at the bottom
          <br>
          2. Tap <strong>Add to Home Screen ⊞</strong>
        </div>
      </div>
    </div>
    <button onclick="dismissIosInstall()" style="background:none; border:none; color:#64748B; font-size:20px; line-height:1; padding:2px 6px; cursor:pointer;">✕</button>
  </div>
  <div style="margin-top:14px; display:flex; justify-content:flex-end; gap:8px;">
    <button onclick="dismissIosInstall()" style="background:#2563EB; color:#fff; border:none; border-radius:10px; padding:7px 18px; font-weight:600; font-size:13px; cursor:pointer;">Got It</button>
  </div>
</div>
`;

function processHtmlFile(sourcePath, targetPath) {
  let content = fs.readFileSync(sourcePath, 'utf8');

  // Replace viewport with complete iOS cover attributes
  content = content.replace(
    /<meta name="viewport"[^>]*>/,
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

console.log('--- Step 4: Writing cache-busting service worker ---');
const cleanSwContent = `// Align Service Worker - Purges stale caches and ensures fresh app loading
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => {
        return self.clients.matchAll({ type: 'window' }).then((clients) => {
          clients.forEach((c) => {
            if (c.url && 'navigate' in c) {
              c.navigate(c.url);
            }
          });
        });
      })
  );
});

self.addEventListener('fetch', (e) => {
  // Always fetch fresh network assets
  e.respondWith(fetch(e.request));
});
`;
fs.writeFileSync(path.join(publicDir, 'sw.js'), cleanSwContent, 'utf8');

console.log('--- Step 5: Export and sync complete! ---');

