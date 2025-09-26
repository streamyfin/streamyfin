module.exports = ({ config }) => {
  if (process.env.EXPO_TV === "1") {
    // Add TV-specific plugin for TV builds
    config.plugins.push("@react-native-tvos/config-tv");
  } else {
    // Add non-TV specific plugins for phone builds
    config.plugins.push("expo-background-task");

    config.plugins.push([
      "react-native-google-cast",
      { useDefaultExpandedMediaControls: true },
    ]);

    // Add the background downloader plugin only for non-TV builds
    config.plugins.push("./plugins/withRNBackgroundDownloader.js");
  }
  return {
    android: {
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON,
    },
    ...config,
  };
};
