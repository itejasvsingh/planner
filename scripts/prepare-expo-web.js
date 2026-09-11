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

// PWA and Cache-Busting snippet to inject into <head> of HTML files
const pwaHeadSnippet = `
  <!-- PWA & iOS Home Screen Support -->
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Align">
  <meta name="theme-color" content="#0F172A">
  <link rel="manifest" href="/manifest.json">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <script>
    // Invalidate stale caches from older version
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
        for (var r of regs) {
          r.update();
        }
      });
    }
  </script>
`;

function processHtmlFile(sourcePath, targetPath) {
  let content = fs.readFileSync(sourcePath, 'utf8');
  // Inject PWA snippet before </head> if not present
  if (!content.includes('apple-mobile-web-app-title')) {
    content = content.replace('</head>', `${pwaHeadSnippet}</head>`);
  }
  // Ensure viewport has viewport-fit=cover
  content = content.replace('viewport-fit=cover,', '');
  content = content.replace('name="viewport" content="', 'name="viewport" content="viewport-fit=cover, ');

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

