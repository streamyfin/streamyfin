const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Expo config plugin that adds EXPO_TV=1 to .xcode.env.local for TV builds.
 *
 * This ensures that when building directly from Xcode (without using `bun run ios:tv`),
 * Metro bundler knows it's a TV build and properly excludes unsupported modules
 * like react-native-track-player.
 */
const withTVXcodeEnv = (config) => {
  // Only apply for TV builds
  if (process.env.EXPO_TV !== "1") {
    return config;
  }

  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const iosPath = path.join(config.modRequest.projectRoot, "ios");
      const xcodeEnvLocalPath = path.join(iosPath, ".xcode.env.local");

      // Read existing content or start fresh
      let content = "";
      if (fs.existsSync(xcodeEnvLocalPath)) {
        content = fs.readFileSync(xcodeEnvLocalPath, "utf-8");
      }

      // Add EXPO_TV=1 if not already present
      const expoTvExport = "export EXPO_TV=1";
      if (!content.includes(expoTvExport)) {
        // Ensure we have a newline at the end before adding
        if (content.length > 0 && !content.endsWith("\n")) {
          content += "\n";
        }
        content += `${expoTvExport}\n`;
        fs.writeFileSync(xcodeEnvLocalPath, content);
        console.log("[withTVXcodeEnv] Added EXPO_TV=1 to .xcode.env.local");
      }

      return config;
    },
  ]);
};

module.exports = withTVXcodeEnv;
