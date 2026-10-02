// Turns off Android "lint vital" checks for release builds. They only report warnings for a sideloaded APK,
// and on the GitHub runner the check crashed in a library module and then hung the build until it timed out.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// align: no release lint';

module.exports = function withNoReleaseLint(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy' || cfg.modResults.contents.includes(MARKER)) return cfg;
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /\nandroid\s*\{/,
      (m) => `${m}\n    ${MARKER}\n    lint {\n        checkReleaseBuilds false\n        abortOnError false\n    }`,
    );
    return cfg;
  });
};
