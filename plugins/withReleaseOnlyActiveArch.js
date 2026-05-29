const { withXcodeProject } = require("@expo/config-plugins");

/**
 * Fixes iOS Release build failure with MPVKit on simulator
 *
 * Background: MPVKit-GPL ships arm64-only slices for its own code, but the
 * underlying MPVKit.xcframework contains both arm64 and x86_64 simulator slices.
 *
 * The Problem: Xcode Release builds default to ONLY_ACTIVE_ARCH=NO, causing
 * Swift module interface compilation for both architectures. However,
 * MpvPlayer.podspec restricts VALID_ARCHS to arm64 only, so the x86_64 Swift
 * module is missing and the build fails.
 *
 * The Solution: Set ONLY_ACTIVE_ARCH=YES for Release simulator builds, matching
 * Debug behavior. A simulator Release build only needs to run on the local Mac's
 * architecture, so building for both is unnecessary and causes the failure.
 *
 * Issue: This resolves build failures when using MPVKit-GPL with the
 * Streamyfin video player on Apple Silicon Macs.
 */

// MPVKit-GPL ships arm64-only XCFramework slices for its own code,
// but the underlying binary framework (MPVKit.xcframework) actually
// contains both arm64 and x86_64 simulator slices.
// However, Xcode's Release configuration defaults to ONLY_ACTIVE_ARCH=NO,
// which causes it to compile Swift module interfaces for both arm64
// and x86_64 against the Expo module wrapper (MpvPlayer).
// The MpvPlayer.podspec restricts VALID_ARCHS to arm64, so the x86_64
// Swift module is missing, causing the build failure.
//
// Setting ONLY_ACTIVE_ARCH=YES for Release builds on simulator matches
// Debug behavior and is correct: a simulator Release build only needs
// to run on the local Mac's architecture.
const withReleaseOnlyActiveArch = (config) => {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const configurations = project.pbxXCBuildConfigurationSection();

    for (const key in configurations) {
      const buildConfig = configurations[key];
      if (
        typeof buildConfig === "object" &&
        buildConfig.buildSettings &&
        buildConfig.name === "Release"
      ) {
        buildConfig.buildSettings.ONLY_ACTIVE_ARCH = "YES";
      }
    }

    return config;
  });
};

module.exports = withReleaseOnlyActiveArch;
