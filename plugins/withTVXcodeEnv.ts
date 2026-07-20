import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { type ConfigPlugin, withDangerousMod } from "expo/config-plugins";

/**
 * Expo config plugin that adds EXPO_TV=1 and NODE_BINARY to .xcode.env.local for TV builds.
 *
 * This ensures that when building directly from Xcode (without using `bun run ios:tv`),
 * Metro bundler knows it's a TV build and properly excludes unsupported modules
 * like react-native-track-player.
 *
 * It also sets NODE_BINARY for nvm users since Xcode can't resolve shell functions.
 */
const withTVXcodeEnv: ConfigPlugin = (config) => {
  // Only apply for TV builds
  if (process.env.EXPO_TV !== "1") {
    return config;
  }

  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const iosPath = path.join(config.modRequest.projectRoot, "ios");
      const xcodeEnvLocalPath = path.join(iosPath, ".xcode.env.local");

      // Read existing content or start fresh — no exists-check first, so a
      // concurrent create/delete can't race between check and read
      let content = "";
      try {
        content = fs.readFileSync(xcodeEnvLocalPath, "utf-8");
      } catch {
        // File doesn't exist yet
      }

      let modified = false;

      // Add NODE_BINARY if not already present (needed for nvm users)
      if (!content.includes("export NODE_BINARY=")) {
        const nodePath = getNodeBinaryPath();
        if (nodePath) {
          if (content.length > 0 && !content.endsWith("\n")) {
            content += "\n";
          }
          content += `export NODE_BINARY=${nodePath}\n`;
          modified = true;
          console.log(
            `[withTVXcodeEnv] Added NODE_BINARY=${nodePath} to .xcode.env.local`,
          );
        }
      }

      // Add EXPO_TV=1 if not already present
      const expoTvExport = "export EXPO_TV=1";
      if (!content.includes(expoTvExport)) {
        if (content.length > 0 && !content.endsWith("\n")) {
          content += "\n";
        }
        content += `${expoTvExport}\n`;
        modified = true;
        console.log("[withTVXcodeEnv] Added EXPO_TV=1 to .xcode.env.local");
      }

      if (modified) {
        fs.writeFileSync(xcodeEnvLocalPath, content);
      }

      return config;
    },
  ]);
};

/**
 * Get the actual node binary path, handling nvm installations.
 */
function getNodeBinaryPath(): string | null {
  try {
    // First try to get node path directly (works for non-nvm installs)
    const directPath = execSync("which node 2>/dev/null", {
      encoding: "utf-8",
    }).trim();
    if (directPath && fs.existsSync(directPath)) {
      return directPath;
    }
  } catch {
    // Ignore errors
  }

  try {
    // For nvm users, source nvm and get the path
    const nvmPath = execSync(
      'bash -c "source ~/.nvm/nvm.sh 2>/dev/null && which node"',
      { encoding: "utf-8" },
    ).trim();
    if (nvmPath && fs.existsSync(nvmPath)) {
      return nvmPath;
    }
  } catch {
    // Ignore errors
  }

  // Fallback: look for node in common nvm location
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (homeDir) {
    const nvmVersionsDir = path.join(homeDir, ".nvm", "versions", "node");
    if (fs.existsSync(nvmVersionsDir)) {
      const versions = fs.readdirSync(nvmVersionsDir).sort().reverse();
      for (const version of versions) {
        const nodeBin = path.join(nvmVersionsDir, version, "bin", "node");
        if (fs.existsSync(nodeBin)) {
          return nodeBin;
        }
      }
    }
  }

  return null;
}

export default withTVXcodeEnv;
