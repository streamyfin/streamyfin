const { withEntitlementsPlist } = require("expo/config-plugins");

/**
 * Expo config plugin to add User Management entitlement for tvOS profile linking
 */
const withTVUserManagement = (config) => {
  return withEntitlementsPlist(config, (config) => {
    // Only add for tvOS builds (check if building for TV)
    // The entitlement is needed for TVUserManager.currentUserIdentifier to work
    config.modResults["com.apple.developer.user-management"] = [
      "runs-as-current-user",
    ];

    console.log("[withTVUserManagement] Added user-management entitlement");

    return config;
  });
};

module.exports = withTVUserManagement;
