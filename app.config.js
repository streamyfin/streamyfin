module.exports = ({ config }) => {
  if (process.env.EXPO_TV !== "1") {
    config.plugins.push("expo-background-task");

    config.plugins.push([
      "react-native-google-cast",
      { useDefaultExpandedMediaControls: true },
    ]);

    // KSPlayer for iOS (GPU acceleration + native PiP)
    config.plugins.push("./plugins/withKSPlayer.js");
  }

  // Only override googleServicesFile if env var is set
  const androidConfig = {};
  if (process.env.GOOGLE_SERVICES_JSON) {
    androidConfig.googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  }

  return {
    ...(Object.keys(androidConfig).length > 0 && { android: androidConfig }),
    ...config,
  };
};
