const { withAndroidManifest } = require("@expo/config-plugins");

const withGoogleCastActivity = (config) =>
  withAndroidManifest(config, async (config) => {
    const mainApplication = config.modResults.manifest.application[0];

    // Initialize activity array if it doesn't exist
    if (!mainApplication.activity) {
      mainApplication.activity = [];
    }

    // Check if the activity already exists
    const activityExists = mainApplication.activity.some(
      (activity) =>
        activity.$?.["android:name"] ===
        "com.reactnative.googlecast.RNGCExpandedControllerActivity"
    );

    // Only add the activity if it doesn't already exist
    if (!activityExists) {
      mainApplication.activity.push({
        $: {
          "android:name":
            "com.reactnative.googlecast.RNGCExpandedControllerActivity",
          "android:theme": "@style/Theme.MaterialComponents.NoActionBar",
          "android:launchMode": "singleTask",
        },
      });
    }

    return config;
  });

module.exports = withGoogleCastActivity;
