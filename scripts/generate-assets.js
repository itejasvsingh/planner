const fs = require('fs');
const sharp = require('sharp');
if (!fs.existsSync('resources')) fs.mkdirSync('resources');

const bg = '<svg viewBox="0 0 1024 1024" width="1024" height="1024" xmlns="http://www.w3.org/2000/svg"><rect width="1024" height="1024" fill="#0f172a"/></svg>';
const fg = '<svg viewBox="0 0 1024 1024" width="1024" height="1024" xmlns="http://www.w3.org/2000/svg"><circle cx="512" cy="512" r="320" stroke="#38bdf8" stroke-width="40" fill="none"/><path d="M 460 300 L 564 300 L 744 700 L 624 700 L 512 430 L 400 700 L 280 700 Z" fill="#ffffff" /><rect x="395" y="540" width="234" height="70" fill="#ffffff" /></svg>';
const icon = '<svg viewBox="0 0 1024 1024" width="1024" height="1024" xmlns="http://www.w3.org/2000/svg"><rect width="1024" height="1024" fill="#0f172a"/><circle cx="512" cy="512" r="320" stroke="#38bdf8" stroke-width="40" fill="none"/><path d="M 460 300 L 564 300 L 744 700 L 624 700 L 512 430 L 400 700 L 280 700 Z" fill="#ffffff" /><rect x="395" y="540" width="234" height="70" fill="#ffffff" /></svg>';
const splash = '<svg viewBox="0 0 1024 1024" width="2732" height="2732" xmlns="http://www.w3.org/2000/svg"><rect width="1024" height="1024" fill="#0f172a"/><g transform="scale(0.6) translate(340, 340)"><circle cx="512" cy="512" r="320" stroke="#38bdf8" stroke-width="40" fill="none"/><path d="M 460 300 L 564 300 L 744 700 L 624 700 L 512 430 L 400 700 L 280 700 Z" fill="#ffffff" /><rect x="395" y="540" width="234" height="70" fill="#ffffff" /></g></svg>';

async function draw() {
  await sharp(Buffer.from(bg)).png().toFile('resources/icon-background.png');
  await sharp(Buffer.from(fg)).png().toFile('resources/icon-foreground.png');
  await sharp(Buffer.from(icon)).png().toFile('resources/icon-only.png');
  await sharp(Buffer.from(splash)).png().toFile('resources/splash.png');
  console.log('\n✅ Align App master images generated successfully!');
}
draw();
