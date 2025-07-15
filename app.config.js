module.exports = ({ config }) => {
  if (process.env.EXPO_TV !== "1") {
    config.plugins.push([
      "react-native-google-cast",
      { useDefaultExpandedMediaControls: true },
    ]);
  } else {
    // Remove the background downloader plugin for TV builds
    config.plugins = config.plugins.filter((plugin) => {
      // Handle both string and array format plugins
      const pluginName = Array.isArray(plugin) ? plugin[0] : plugin;
      return pluginName !== "./plugins/withRNBackgroundDownloader.js";
    });
  }
  return {
    android: {
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON,
    },
    ...config,
  };
};
