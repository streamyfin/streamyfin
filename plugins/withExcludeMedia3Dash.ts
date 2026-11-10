import { type ConfigPlugin, withAppBuildGradle } from "expo/config-plugins";

/** The Media3 release every androidx.media3 artifact resolves to, as the local players declare it. */
export const MEDIA3_VERSION = "1.11.1";

// track-player's DASH, SmoothStreaming and RTSP artifacts, which nothing in the app plays.
const EXCLUSIONS = `
configurations.all {
    // Exclude duplicate media3 modules to avoid conflict between react-native-video and react-native-track-player
    exclude group: 'androidx.media3', module: 'media3-exoplayer-dash'
    exclude group: 'androidx.media3', module: 'media3-exoplayer-smoothstreaming'
    exclude group: 'androidx.media3', module: 'media3-exoplayer-rtsp'
}
`;

const ALIGNMENT_REASON =
  "one Media3 release for the players and the music queue";

const ALIGNMENT = `
configurations.all {
    resolutionStrategy.eachDependency { details ->
        if (details.requested.group == 'androidx.media3') {
            details.useVersion '${MEDIA3_VERSION}'
            details.because '${ALIGNMENT_REASON}'
        }
    }
}
`;

// The version an alignment rule this plugin wrote pins, whichever release that was.
const ALIGNED_VERSION = new RegExp(
  `details\\.useVersion '[^']*'(\\s*details\\.because '${ALIGNMENT_REASON}')`,
);

/**
 * Adds the Media3 blocks to the app's build.gradle, ahead of its dependencies, once each.
 *
 * Gradle picks the highest version of each media3 artifact on its own, so the players' release
 * next to react-native-track-player's older one would mix two (exoplayer from one, session from
 * the other): every androidx.media3 artifact is aligned on MEDIA3_VERSION instead. A build file
 * that an earlier prebuild left behind gets what it lacks: the alignment next to the exclusions
 * written before it existed, or the current release in place of an earlier one.
 */
export const alignMedia3 = (contents: string): string => {
  if (ALIGNED_VERSION.test(contents)) {
    contents = contents.replace(
      ALIGNED_VERSION,
      `details.useVersion '${MEDIA3_VERSION}'$1`,
    );
  }
  const blocks =
    (contents.includes("media3-exoplayer-dash") ? "" : EXCLUSIONS) +
    (ALIGNED_VERSION.test(contents) ? "" : ALIGNMENT);
  const dependenciesIndex = contents.indexOf("dependencies {");
  if (!blocks || dependenciesIndex === -1) return contents;
  return `${contents.slice(0, dependenciesIndex)}${blocks}\n${contents.slice(dependenciesIndex)}`;
};

const withExcludeMedia3Dash: ConfigPlugin = (config) =>
  withAppBuildGradle(config, (config) => {
    config.modResults.contents = alignMedia3(config.modResults.contents);
    return config;
  });

export default withExcludeMedia3Dash;
