// react-native.config.js
//https://docs.expo.dev/modules/autolinking/

const isTV = process.env?.EXPO_TV === "1";

const disableForTV = (_moduleName) =>
  isTV
    ? {
        platforms: {
          ios: null,
          android: null,
        },
      }
    : undefined;

const dependencies = {
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
  "expo-notifications": disableForTV("expo-notifications"),
  "react-native-image-colors": disableForTV("react-native-image-colors"),
  "expo-sharing": disableForTV("expo-sharing"),
  "expo-haptics": disableForTV("expo-haptics"),
  "expo-brightness": disableForTV("expo-brightness"),
  "expo-sensors": disableForTV("expo-sensors"),
  "expo-screen-orientation": disableForTV("expo-screen-orientation"),
  "react-native-ios-context-menu": disableForTV(
    "react-native-ios-context-menu",
  ),
  "react-native-ios-utilities": disableForTV("react-native-ios-utilities"),
  "react-native-pager-view": disableForTV("react-native-pager-view"),
  "react-native-track-player": disableForTV("react-native-track-player"),
  "expo-location": disableForTV("expo-location"),
  "react-native-glass-effect-view": disableForTV(
    "react-native-glass-effect-view",
  ),
};

// Filter out undefined values
const cleanDependencies = Object.fromEntries(
  Object.entries(dependencies).filter(([_, value]) => value !== undefined),
);

module.exports = {
  dependencies: cleanDependencies,
  project: {
    ios: {},
    android: {},
  },
};
