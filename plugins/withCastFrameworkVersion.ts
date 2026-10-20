import { type ConfigPlugin, withProjectBuildGradle } from "expo/config-plugins";

// react-native-google-cast builds against play-services-cast-framework "+",
// whatever Google released last, unless the project sets
// castFrameworkVersion. 23.0.0 depends on androidx.mediarouter 1.9.0-beta01,
// which needs compileSdk 37 and Android Gradle plugin 9.1, so every Android
// build failed from the day it came out. The library is linked on Android TV
// too, where its own config plugin does not run, so the version is set here
// for both. Raise it together with compileSdk.
export const CAST_FRAMEWORK_VERSION = "22.3.1";

const ASSIGNMENT = /castFrameworkVersion\s*=\s*["'][^"'\n]*["']/;
const EXT_BLOCK = /\bext\s*\{/;
const BUILDSCRIPT_BLOCK = /\bbuildscript\s*\{/;

/** The root build.gradle with castFrameworkVersion pinned in its ext block. */
export const pinCastFrameworkVersion = (contents: string): string => {
  const line = `castFrameworkVersion = "${CAST_FRAMEWORK_VERSION}"`;
  // The library's own plugin writes "+" here on phone builds.
  if (ASSIGNMENT.test(contents)) return contents.replace(ASSIGNMENT, line);
  if (EXT_BLOCK.test(contents)) {
    return contents.replace(EXT_BLOCK, (block) => `${block}\n        ${line}`);
  }
  if (BUILDSCRIPT_BLOCK.test(contents)) {
    return contents.replace(
      BUILDSCRIPT_BLOCK,
      (block) => `${block}\n    ext {\n        ${line}\n    }`,
    );
  }
  return `${contents}\next.${line}\n`;
};

const withCastFrameworkVersion: ConfigPlugin = (config) =>
  withProjectBuildGradle(config, (gradle) => {
    gradle.modResults.contents = pinCastFrameworkVersion(
      gradle.modResults.contents,
    );
    return gradle;
  });

export default withCastFrameworkVersion;
