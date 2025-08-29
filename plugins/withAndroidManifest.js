const { withAndroidManifest } = require("expo/config-plugins");

const _withGoogleCastAndroidManifest = (config) =>
  withAndroidManifest(config, async (mod) => {
    const mainApplication = mod.modResults.manifest.application[0];

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
          "android:exported": "false",
        },
      });
    }

    const mainActivity = mainApplication.activity.find(
      (activity) => activity.$?.["android:name"] === ".MainActivity",
    );

    if (mainActivity?.$) {
      mainActivity.$["android:supportsPictureInPicture"] = "true";
    }

    return mod;
  });

module.exports = _withGoogleCastAndroidManifest;
