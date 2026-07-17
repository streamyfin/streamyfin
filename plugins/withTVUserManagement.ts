import { type ConfigPlugin, withEntitlementsPlist } from "expo/config-plugins";

/**
 * Expo config plugin to add User Management entitlement for tvOS profile linking
 */
const withTVUserManagement: ConfigPlugin = (config) => {
  // Only add for tvOS builds. The entitlement is restricted by Apple and must
  // be present in the provisioning profile, so injecting it into mobile builds
  // breaks signing ("Entitlement ... not found and could not be included in
  // profile"). The entitlement is only needed for tvOS
  // TVUserManager.currentUserIdentifier.
  if (process.env.EXPO_TV !== "1") {
    return config;
  }

  return withEntitlementsPlist(config, (config) => {
    config.modResults["com.apple.developer.user-management"] = [
      "runs-as-current-user",
    ];

    console.log("[withTVUserManagement] Added user-management entitlement");

    return config;
  });
};

export default withTVUserManagement;
