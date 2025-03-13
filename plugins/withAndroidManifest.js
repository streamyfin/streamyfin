const {
  withAndroidManifest: NativeAndroidManifest,
} = require("@expo/config-plugins");

const withAndroidManifest = (config) =>
  NativeAndroidManifest(config, async (config) => {
    const mainApplication = config.modResults.manifest.application[0];

    // Initialize activity array if it doesn't exist
    if (!mainApplication.activity) {
      mainApplication.activity = [];
    }

    const googleCastActivityExists = mainApplication.activity.some(
      (activity) =>
        activity.$?.["android:name"] ===
        "com.reactnative.googlecast.RNGCExpandedControllerActivity",
    );

    // Only add the activity if it doesn't already exist
    if (!googleCastActivityExists) {
      mainApplication.activity.push({
        $: {
          "android:name":
            "com.reactnative.googlecast.RNGCExpandedControllerActivity",
          "android:theme": "@style/Theme.MaterialComponents.NoActionBar",
          "android:launchMode": "singleTask",
        },
      });
    }

    const mainActivity = mainApplication.activity.find(
      (activity) => activity.$?.["android:name"] === ".MainActivity",
    );

    if (mainActivity) {
      mainActivity.$["android:supportsPictureInPicture"] = "true";
    }

    return config;
  });

module.exports = withAndroidManifest;
