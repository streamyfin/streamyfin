module.exports = ({ config }) => {
  if (process.env.EXPO_TV != "1") {
    config.plugins.push([
      "react-native-google-cast",
      { useDefaultExpandedMediaControls: true },
    ]);
  }
  return {
    ...config,
  };
};
