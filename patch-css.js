const fs = require('fs');

const globalCss = `html, body {
  margin: 0;
  padding: 0;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  background-color: #0A0B0F !important;
  color: #F5F5F7 !important;
  overflow: hidden;
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

@media (prefers-color-scheme: light) {
  html, body, #root {
    background-color: #F4F7F6 !important;
    color: #182B32 !important;
  }
}

html[data-theme="dark"],
html[data-theme="dark"] body,
html[data-theme="dark"] #root {
  background-color: #0A0B0F !important;
  color: #F5F5F7 !important;
}

html[data-theme="light"],
html[data-theme="light"] body,
html[data-theme="light"] #root {
  background-color: #F4F7F6 !important;
  color: #182B32 !important;
}

:root {
  --tab-bar-bg: #0A0B0F;
}

@media (prefers-color-scheme: light) {
  :root {
    --tab-bar-bg: #F4F7F6;
  }
}

html[data-theme="dark"] {
  --tab-bar-bg: #0A0B0F;
}

html[data-theme="light"] {
  --tab-bar-bg: #F4F7F6;
}
`;
fs.writeFileSync('align-native/src/global.css', globalCss);

let prep = fs.readFileSync('scripts/prepare-expo-web.js', 'utf8');
prep = prep.replace(/html, body \{[\s\S]*?\}/, `html, body {
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
    }`);
fs.writeFileSync('scripts/prepare-expo-web.js', prep);
