const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const NEXT_DIR = path.join(ROOT_DIR, '.next');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const CAP_ASSETS_DIR = path.join(ROOT_DIR, 'cap-assets');

function copyDirRecursive(src, dest) {
    if (!fs.existsSync(src)) return;
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

function buildCapAssets() {
    console.log('--- Preparing Standalone Capacitor Offline Assets ---');

    // Verify .next build output exists
    const serverAppDir = path.join(NEXT_DIR, 'server', 'app');
    const indexHtmlSource = path.join(serverAppDir, 'index.html');

    if (!fs.existsSync(indexHtmlSource)) {
        console.error('Error: .next build output not found. Please run "npm run build" first.');
        process.exit(1);
    }

    // 1. Clean and initialize cap-assets directory
    if (fs.existsSync(CAP_ASSETS_DIR)) {
        fs.rmSync(CAP_ASSETS_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(CAP_ASSETS_DIR, { recursive: true });

    // 2. Copy public directory assets (favicons, manifests, icons)
    console.log('-> Copying public assets...');
    copyDirRecursive(PUBLIC_DIR, CAP_ASSETS_DIR);

    // 3. Copy .next/static to cap-assets/_next/static
    console.log('-> Copying static chunks & CSS...');
    const staticSource = path.join(NEXT_DIR, 'static');
    const staticDest = path.join(CAP_ASSETS_DIR, '_next', 'static');
    copyDirRecursive(staticSource, staticDest);

    // 4. Copy and prepare index.html
    console.log('-> Generating native index.html...');
    let htmlContent = fs.readFileSync(indexHtmlSource, 'utf-8');

    // Inject Capacitor native runtime script if not present
    if (!htmlContent.includes('capacitor.js')) {
        htmlContent = htmlContent.replace('<head>', '<head><script src="/capacitor.js"></script>');
    }

    fs.writeFileSync(path.join(CAP_ASSETS_DIR, 'index.html'), htmlContent, 'utf-8');

    // 5. Copy RSC payload files if present for instant hydration
    const rscFiles = ['index.rsc', 'index.meta'];
    for (const file of rscFiles) {
        const srcFile = path.join(serverAppDir, file);
        if (fs.existsSync(srcFile)) {
            fs.copyFileSync(srcFile, path.join(CAP_ASSETS_DIR, file));
        }
    }

    console.log('✓ Successfully bundled 100% self-contained offline assets into cap-assets/');
}

buildCapAssets();
