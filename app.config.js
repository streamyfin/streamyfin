module.exports = ({ config }) => {
  config.plugins.push([
    "react-native-google-cast",
    { useDefaultExpandedMediaControls: true },
  ]);
  return {
    android: {
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON,
    },
    ...config,
  };
};
