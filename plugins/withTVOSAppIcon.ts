import { type ConfigPlugin, withXcodeProject } from "expo/config-plugins";

const withTVOSAppIcon: ConfigPlugin = (config) => {
  // Only apply for TV builds
  if (process.env.EXPO_TV !== "1") {
    return config;
  }

  return withXcodeProject(config, async (config) => {
    const xcodeProject = config.modResults;

    const buildConfigurations = xcodeProject.pbxXCBuildConfigurationSection();

    for (const key in buildConfigurations) {
      const buildConfig = buildConfigurations[key];
      if (
        typeof buildConfig === "object" &&
        buildConfig.buildSettings &&
        buildConfig.buildSettings.PRODUCT_NAME
      ) {
        // Set the tvOS app icon
        buildConfig.buildSettings.ASSETCATALOG_COMPILER_APPICON_NAME =
          "TVAppIcon";
      }
    }

    return config;
  });
};

export default withTVOSAppIcon;
