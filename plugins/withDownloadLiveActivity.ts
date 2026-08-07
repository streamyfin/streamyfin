import type { ExpoConfig } from "expo/config";
import {
  type ConfigPlugin,
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
} from "expo/config-plugins";

const EXTENSION_TARGET_NAME = "StreamyfinDownloadActivity";
const TARGET_SOURCE_DIR = "../targets/StreamyfinDownloadActivity";
// The ActivityAttributes declaration is shared with the app, where it is compiled into the
// BackgroundDownloader pod. ActivityKit matches on the unqualified type name, so both targets
// compiling the same file into different Swift modules is fine — and is Apple's documented approach.
const SHARED_ATTRIBUTES_SOURCE =
  "../modules/background-downloader/ios/DownloadActivityAttributes.swift";
const APP_GROUP_INFO_PLIST_KEY = "StreamyfinDownloadsAppGroupIdentifier";

interface AppExtensionConfig {
  targetName: string;
  bundleIdentifier: string;
  entitlements: {
    "com.apple.security.application-groups": string[];
  };
}

function getBundleIdentifier(config: ExpoConfig): string {
  return config.ios?.bundleIdentifier || "com.fredrikburmester.streamyfin";
}

function getAppGroupIdentifier(config: ExpoConfig): string {
  return `group.${getBundleIdentifier(config)}.downloads`;
}

// The xcode project object has no usable typings — keep `any` here.
function getBuildConfigurations(project: any, configurationListId: string) {
  const configurationList =
    project.hash.project.objects.XCConfigurationList[configurationListId];

  if (!configurationList?.buildConfigurations) return [];

  const buildConfigurations = project.pbxXCBuildConfigurationSection();
  return configurationList.buildConfigurations
    .map((config: { value: string }) => buildConfigurations[config.value])
    .filter(Boolean);
}

function ensureAppGroup(value: unknown, appGroupIdentifier: string): string[] {
  const groups = Array.isArray(value) ? value : [];
  return groups.includes(appGroupIdentifier)
    ? groups
    : [...groups, appGroupIdentifier];
}

function ensureAppExtension(
  appExtensions: unknown,
  targetName: string,
  bundleIdentifier: string,
  appGroupIdentifier: string,
): AppExtensionConfig[] {
  const extensionConfig: AppExtensionConfig = {
    targetName,
    bundleIdentifier,
    entitlements: {
      "com.apple.security.application-groups": [appGroupIdentifier],
    },
  };
  const extensions: AppExtensionConfig[] = Array.isArray(appExtensions)
    ? appExtensions
    : [];
  // Keep plugin runs idempotent and preserve unrelated app extension entries.
  const existingIndex = extensions.findIndex(
    (appExtension) => appExtension?.targetName === targetName,
  );

  if (existingIndex === -1) {
    return [...extensions, extensionConfig];
  }

  return extensions.map((appExtension, index) =>
    index === existingIndex ? extensionConfig : appExtension,
  );
}

/**
 * Adds the WidgetKit extension that renders the download Live Activity.
 *
 * Phone-only: tvOS has no ActivityKit, and the whole downloads feature is disabled there anyway
 * (see the TV no-op branch in providers/DownloadProvider.tsx). This mirrors withTVUserManagement.ts
 * and withTVOSTopShelf.ts, which gate the other way on the same env var.
 */
const withDownloadLiveActivity: ConfigPlugin = (config) => {
  if (process.env.EXPO_TV === "1") {
    return config;
  }

  const appGroupIdentifier = getAppGroupIdentifier(config);
  const bundleIdentifier = getBundleIdentifier(config);
  const extensionBundleIdentifier = `${bundleIdentifier}.downloadactivity`;

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
            appExtensions: ensureAppExtension(
              config.extra?.eas?.build?.experimental?.ios?.appExtensions,
              EXTENSION_TARGET_NAME,
              extensionBundleIdentifier,
              appGroupIdentifier,
            ),
          },
        },
      },
    },
  };

  config = withInfoPlist(config, (config) => {
    config.modResults[APP_GROUP_INFO_PLIST_KEY] = appGroupIdentifier;

    // iOS 26 continued processing task: keeps the app executing while a user-started download
    // runs, so the Live Activity can show measured progress instead of a projection. The
    // identifier must be declared here and prefixed with the bundle id.
    const taskIdentifier = `${bundleIdentifier}.downloads`;
    const permitted = Array.isArray(
      config.modResults.BGTaskSchedulerPermittedIdentifiers,
    )
      ? (config.modResults.BGTaskSchedulerPermittedIdentifiers as string[])
      : [];
    if (!permitted.includes(taskIdentifier)) {
      permitted.push(taskIdentifier);
    }
    config.modResults.BGTaskSchedulerPermittedIdentifiers = permitted;

    const backgroundModes = Array.isArray(config.modResults.UIBackgroundModes)
      ? (config.modResults.UIBackgroundModes as string[])
      : [];
    if (!backgroundModes.includes("processing")) {
      backgroundModes.push("processing");
    }
    config.modResults.UIBackgroundModes = backgroundModes;

    return config;
  });

  config = withEntitlementsPlist(config, (config) => {
    config.modResults["com.apple.security.application-groups"] = ensureAppGroup(
      config.modResults["com.apple.security.application-groups"],
      appGroupIdentifier,
    );
    return config;
  });

  return withXcodeProject(config, (config) => {
    const project = config.modResults;

    if (project.pbxTargetByName(EXTENSION_TARGET_NAME)) {
      return config;
    }

    const mainTargetUuid = project.getFirstTarget().uuid;

    // `addTarget` with "app_extension" also creates the Copy Files phase on the app target and adds
    // the .appex product to it, so the extension is embedded without extra work here.
    const target = project.addTarget(
      EXTENSION_TARGET_NAME,
      "app_extension",
      EXTENSION_TARGET_NAME,
      extensionBundleIdentifier,
    );

    project.addBuildPhase(
      [
        `${TARGET_SOURCE_DIR}/StreamyfinDownloadActivityBundle.swift`,
        `${TARGET_SOURCE_DIR}/DownloadActivityWidget.swift`,
        SHARED_ATTRIBUTES_SOURCE,
      ],
      "PBXSourcesBuildPhase",
      "Sources",
      target.uuid,
    );
    project.addBuildPhase(
      ["WidgetKit.framework", "SwiftUI.framework", "ActivityKit.framework"],
      "PBXFrameworksBuildPhase",
      "Frameworks",
      target.uuid,
    );

    // Embedding alone leaves ordering to implicit dependency resolution; make it explicit so the
    // .appex is always built before the app tries to copy it.
    project.addTargetDependency(mainTargetUuid, [target.uuid]);

    const buildConfigurations = getBuildConfigurations(
      project,
      target.pbxNativeTarget.buildConfigurationList,
    );

    for (const buildConfig of buildConfigurations) {
      buildConfig.buildSettings = {
        ...buildConfig.buildSettings,
        CODE_SIGN_ENTITLEMENTS: `${TARGET_SOURCE_DIR}/${EXTENSION_TARGET_NAME}.entitlements`,
        APPLICATION_EXTENSION_API_ONLY: "YES",
        CURRENT_PROJECT_VERSION: config.ios?.buildNumber || "1",
        GENERATE_INFOPLIST_FILE: "NO",
        INFOPLIST_FILE: `${TARGET_SOURCE_DIR}/Info.plist`,
        // Live Activities need 16.2; the app already targets 16.4 via expo-build-properties.
        IPHONEOS_DEPLOYMENT_TARGET:
          buildConfig.buildSettings.IPHONEOS_DEPLOYMENT_TARGET || "16.4",
        MARKETING_VERSION: config.version || "1.0",
        PRODUCT_BUNDLE_IDENTIFIER: extensionBundleIdentifier,
        PRODUCT_NAME: `"${EXTENSION_TARGET_NAME}"`,
        SDKROOT: "iphoneos",
        SKIP_INSTALL: "YES",
        SWIFT_VERSION: "5.9",
        DOWNLOADS_APP_GROUP_IDENTIFIER: appGroupIdentifier,
        SUPPORTED_PLATFORMS: '"iphoneos iphonesimulator"',
        TARGETED_DEVICE_FAMILY: '"1,2"',
      };
    }

    return config;
  });
};

export default withDownloadLiveActivity;
