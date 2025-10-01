// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");
const fs = require("node:fs");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname); // eslint-disable-line no-undef

// Add Hermes parser
config.transformer.hermesParser = true;

// When enabled, the optional code below will allow Metro to resolve
// and bundle source files with TV-specific extensions
// (e.g., *.ios.tv.tsx, *.android.tv.tsx, *.tv.tsx)
//
// Metro will still resolve source files with standard extensions
// as usual if TV-specific files are not found for a module.
//
if (process.env?.EXPO_TV === "1") {
  const originalSourceExts = config.resolver.sourceExts;
  const tvSourceExts = [
    ...originalSourceExts.map((e) => `tv.${e}`),
    ...originalSourceExts,
  ];
  config.resolver.sourceExts = tvSourceExts;
}

// Support for symlinked packages (yarn link) - only if the directory exists
const linkedPackagePath = path.resolve(
  __dirname,
  "../react-native-background-downloader",
);

if (fs.existsSync(linkedPackagePath)) {
  console.log("Detected symlinked package, configuring Metro to support it");

  // Watch the linked package directory
  config.watchFolders = [linkedPackagePath];

  // Add the parent directory to node module paths
  config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];

  // Map the package to the local directory
  config.resolver.extraNodeModules = {
    "@kesha-antonov/react-native-background-downloader": linkedPackagePath,
  };
}

// config.resolver.unstable_enablePackageExports = false;

module.exports = config;
