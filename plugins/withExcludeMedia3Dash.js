const { withAppBuildGradle } = require("expo/config-plugins");

module.exports = function withExcludeMedia3Dash(config) {
  return withAppBuildGradle(config, (config) => {
    const contents = config.modResults.contents;

    // Add exclusion for duplicate media3 modules before dependencies block
    const exclusionBlock = `
configurations.all {
    // Exclude duplicate media3 modules to avoid conflict between react-native-video and react-native-track-player
    exclude group: 'androidx.media3', module: 'media3-exoplayer-dash'
    exclude group: 'androidx.media3', module: 'media3-exoplayer-smoothstreaming'
    exclude group: 'androidx.media3', module: 'media3-exoplayer-rtsp'
}
`;

    // Check if exclusion already exists
    if (contents.includes("media3-exoplayer-dash")) {
      return config;
    }

    // Insert before the dependencies block
    const dependenciesIndex = contents.indexOf("dependencies {");
    if (dependenciesIndex !== -1) {
      config.modResults.contents =
        contents.slice(0, dependenciesIndex) +
        exclusionBlock +
        "\n" +
        contents.slice(dependenciesIndex);
    }

    return config;
  });
};
