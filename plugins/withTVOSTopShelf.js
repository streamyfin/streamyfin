const {
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
} = require("@expo/config-plugins");

const EXTENSION_TARGET_NAME = "StreamyfinTopShelf";
const TARGET_SOURCE_DIR = "../targets/StreamyfinTopShelf";
const APP_GROUP_INFO_PLIST_KEY = "StreamyfinAppGroupIdentifier";
const KEYCHAIN_ACCESS_GROUP_INFO_PLIST_KEY =
  "StreamyfinKeychainAccessGroupIdentifier";

function getBundleIdentifier(config) {
  return config.ios?.bundleIdentifier || "com.fredrikburmester.streamyfin";
}

function getAppGroupIdentifier(config) {
  return `group.${getBundleIdentifier(config)}`;
}

function getKeychainAccessGroupIdentifier(config) {
  return `$(AppIdentifierPrefix)${getBundleIdentifier(config)}`;
}

function getBuildConfigurations(project, configurationListId) {
  const configurationList =
    project.hash.project.objects.XCConfigurationList[configurationListId];

  if (!configurationList?.buildConfigurations) return [];

  const buildConfigurations = project.pbxXCBuildConfigurationSection();
  return configurationList.buildConfigurations
    .map((config) => buildConfigurations[config.value])
    .filter(Boolean);
}

function ensureAppGroup(value, appGroupIdentifier) {
  const groups = Array.isArray(value) ? value : [];
  return groups.includes(appGroupIdentifier)
    ? groups
    : [...groups, appGroupIdentifier];
}

function ensureKeychainAccessGroup(value, keychainAccessGroupIdentifier) {
  const groups = Array.isArray(value) ? value : [];
  return groups.includes(keychainAccessGroupIdentifier)
    ? groups
    : [...groups, keychainAccessGroupIdentifier];
}

const withTVOSTopShelf = (config) => {
  const appGroupIdentifier = getAppGroupIdentifier(config);
  const keychainAccessGroupIdentifier =
    getKeychainAccessGroupIdentifier(config);
  const bundleIdentifier = getBundleIdentifier(config);
  const extensionBundleIdentifier = `${bundleIdentifier}.TopShelf`;

  config.extra = {
    ...config.extra,
    eas: {
      ...config.extra?.eas,
      build: {
        ...config.extra?.eas?.build,
        experimental: {
          ...config.extra?.eas?.build?.experimental,
          ios: {
            ...config.extra?.eas?.build?.experimental?.ios,
            appExtensions: [
              {
                targetName: EXTENSION_TARGET_NAME,
                bundleIdentifier: extensionBundleIdentifier,
                entitlements: {
                  "com.apple.security.application-groups": [appGroupIdentifier],
                  "keychain-access-groups": [keychainAccessGroupIdentifier],
                },
              },
            ],
          },
        },
      },
    },
  };

  config = withInfoPlist(config, (config) => {
    config.modResults[APP_GROUP_INFO_PLIST_KEY] = appGroupIdentifier;
    config.modResults[KEYCHAIN_ACCESS_GROUP_INFO_PLIST_KEY] =
      keychainAccessGroupIdentifier;
    return config;
  });

  config = withEntitlementsPlist(config, (config) => {
    config.modResults["com.apple.security.application-groups"] = ensureAppGroup(
      config.modResults["com.apple.security.application-groups"],
      appGroupIdentifier,
    );
    config.modResults["keychain-access-groups"] = ensureKeychainAccessGroup(
      config.modResults["keychain-access-groups"],
      keychainAccessGroupIdentifier,
    );
    return config;
  });

  if (process.env.EXPO_TV !== "1") {
    return config;
  }

  return withXcodeProject(config, (config) => {
    const project = config.modResults;

    if (project.pbxTargetByName(EXTENSION_TARGET_NAME)) {
      return config;
    }

    const target = project.addTarget(
      EXTENSION_TARGET_NAME,
      "app_extension",
      EXTENSION_TARGET_NAME,
      extensionBundleIdentifier,
    );

    project.addBuildPhase(
      [`${TARGET_SOURCE_DIR}/TopShelfProvider.swift`],
      "PBXSourcesBuildPhase",
      "Sources",
      target.uuid,
    );
    project.addBuildPhase(
      ["TVServices.framework"],
      "PBXFrameworksBuildPhase",
      "Frameworks",
      target.uuid,
    );

    const buildConfigurations = getBuildConfigurations(
      project,
      target.pbxNativeTarget.buildConfigurationList,
    );

    for (const buildConfig of buildConfigurations) {
      buildConfig.buildSettings = {
        ...buildConfig.buildSettings,
        CODE_SIGN_ENTITLEMENTS: `${TARGET_SOURCE_DIR}/${EXTENSION_TARGET_NAME}.entitlements`,
        APPLICATION_EXTENSION_API_ONLY: "YES",
        CURRENT_PROJECT_VERSION: "1",
        INFOPLIST_FILE: `${TARGET_SOURCE_DIR}/Info.plist`,
        IPHONEOS_DEPLOYMENT_TARGET:
          buildConfig.buildSettings.IPHONEOS_DEPLOYMENT_TARGET || "15.6",
        MARKETING_VERSION: config.version || "1.0",
        PRODUCT_BUNDLE_IDENTIFIER: extensionBundleIdentifier,
        PRODUCT_NAME: `"${EXTENSION_TARGET_NAME}"`,
        SDKROOT: "appletvos",
        SKIP_INSTALL: "YES",
        SWIFT_VERSION: "5.9",
        APP_GROUP_IDENTIFIER: appGroupIdentifier,
        KEYCHAIN_ACCESS_GROUP_IDENTIFIER: `"${keychainAccessGroupIdentifier}"`,
        SUPPORTED_PLATFORMS: '"appletvos appletvsimulator"',
        TARGETED_DEVICE_FAMILY: "3",
      };
    }

    return config;
  });
};

module.exports = withTVOSTopShelf;
