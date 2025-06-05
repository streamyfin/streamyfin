module.exports = ({ config }) => {
  // Remove Google Cast plugin registration:
  // if (process.env.EXPO_TV !== "1") {
  //   config.plugins.push([
  //     "react-native-google-cast",
  //     { useDefaultExpandedMediaControls: true },
  //   ]);
  // }

  // Keep this ONLY if you use other Google services (like Firebase):
  return {
    android: {
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON,
    },
    ...config,
  };
};
