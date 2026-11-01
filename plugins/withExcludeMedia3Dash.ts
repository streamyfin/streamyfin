import { type ConfigPlugin, withAppBuildGradle } from "expo/config-plugins";

/** The Media3 release every androidx.media3 artifact resolves to, as the local players declare it. */
export const MEDIA3_VERSION = "1.11.1";

/**
 * Adds the Media3 block to the app's build.gradle, ahead of its dependencies, once.
 *
 * Gradle picks the highest version of each media3 artifact on its own, so the players' release
 * next to react-native-track-player's older one would mix two (exoplayer from one, session from
 * the other): every androidx.media3 artifact is aligned on MEDIA3_VERSION instead.
 */
export const alignMedia3 = (contents: string): string => {
  if (contents.includes("media3-exoplayer-dash")) return contents;

  const exclusionBlock = `
configurations.all {
    // Exclude duplicate media3 modules to avoid conflict between react-native-video and react-native-track-player
    exclude group: 'androidx.media3', module: 'media3-exoplayer-dash'
    exclude group: 'androidx.media3', module: 'media3-exoplayer-smoothstreaming'
    exclude group: 'androidx.media3', module: 'media3-exoplayer-rtsp'
    resolutionStrategy.eachDependency { details ->
        if (details.requested.group == 'androidx.media3') {
            details.useVersion '${MEDIA3_VERSION}'
            details.because 'one Media3 release for the players and the music queue'
        }
    }
}
`;

  const dependenciesIndex = contents.indexOf("dependencies {");
  if (dependenciesIndex === -1) return contents;
  return (
    contents.slice(0, dependenciesIndex) +
    exclusionBlock +
    "\n" +
    contents.slice(dependenciesIndex)
  );
};

const withExcludeMedia3Dash: ConfigPlugin = (config) =>
  withAppBuildGradle(config, (config) => {
    config.modResults.contents = alignMedia3(config.modResults.contents);
    return config;
  });

export default withExcludeMedia3Dash;
