// react-native.config.js
//https://docs.expo.dev/modules/autolinking/

const isTV = process.env?.EXPO_TV === "1";

module.exports = {
  dependencies: {
    "react-native-volume-manager": !isTV
      ? {
          platforms: {
            // leaving this blank seems to enable auto-linking which is what we want for mobile
          },
        }
      : {
          platforms: {
            android: null,
          },
        },
  },
};
