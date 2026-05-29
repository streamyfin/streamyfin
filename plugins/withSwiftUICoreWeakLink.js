const { withXcodeProject } = require("@expo/config-plugins");

// Tokens written verbatim as OTHER_LDFLAGS array entries.
const LDFLAG_TOKENS = ['"-weak_framework"', '"SwiftUICore"'];

/**
 * Xcode 26 + `use_frameworks! :linkage => :static` makes the main app target
 * auto-link SwiftUICore directly (SwiftUI was split into SwiftUI + SwiftUICore on
 * recent SDKs, and the SwiftUI pods' object files carry a `-framework SwiftUICore`
 * autolink directive that flows into the app link). The linker then rejects it:
 *   ld: cannot link directly with 'SwiftUICore' because product being built is
 *       not an allowed client of it
 * Weakly linking SwiftUICore on the app target bypasses the allowed-client check;
 * the symbols still resolve at runtime via SwiftUI's re-export.
 *
 * Scoped to `com.apple.product-type.application` ONLY — it must not touch the
 * tvOS TopShelf app-extension (which legitimately links SwiftUI); applying the
 * flag there breaks that target.
 */
const withSwiftUICoreWeakLink = (config) =>
  withXcodeProject(config, (config) => {
    const project = config.modResults;
    const nativeTargets = project.pbxNativeTargetSection();
    const configLists = project.pbxXCConfigurationList();
    const buildConfigs = project.pbxXCBuildConfigurationSection();

    // Collect build-configuration UUIDs that belong to application targets only.
    const appConfigIds = new Set();
    for (const key of Object.keys(nativeTargets)) {
      const target = nativeTargets[key];
      if (!target || typeof target !== "object" || !target.productType)
        continue;
      const productType = String(target.productType).replace(/"/g, "");
      if (productType !== "com.apple.product-type.application") continue;
      const list = configLists[target.buildConfigurationList];
      if (!list || !list.buildConfigurations) continue;
      for (const bc of list.buildConfigurations) appConfigIds.add(bc.value);
    }

    for (const id of appConfigIds) {
      const entry = buildConfigs[id];
      if (!entry || typeof entry !== "object" || !entry.buildSettings) continue;
      const settings = entry.buildSettings;
      let flags = settings.OTHER_LDFLAGS;
      if (flags == null || flags === '""' || flags === "") {
        flags = ['"$(inherited)"'];
      } else if (typeof flags === "string") {
        flags = [flags];
      }
      const already = flags.some((f) => String(f).includes("SwiftUICore"));
      if (!already) {
        flags.push(...LDFLAG_TOKENS);
        settings.OTHER_LDFLAGS = flags;
      }
    }

    return config;
  });

module.exports = withSwiftUICoreWeakLink;
