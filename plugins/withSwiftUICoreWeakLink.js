const { withPodfile } = require("expo/config-plugins");

// iOS 26 / Xcode 26: some pods (Liquid Glass / SwiftUI-based, e.g.
// react-native-glass-effect-view, @expo/ui) pull in SwiftUICore, which cannot
// be linked directly ("not an allowed client of it"). Weak-linking SwiftUICore
// on the app target(s) satisfies the linker. iOS-only; tvOS is unaffected.
const PATCH_START = "## >>> swiftuicore weak link";
const PATCH_END = "## <<< swiftuicore weak link";

function buildPatch() {
  return [
    PATCH_START,
    "  installer.aggregate_targets.each do |aggregate_target|",
    "    aggregate_target.user_project.native_targets.each do |target|",
    "      target.build_configurations.each do |cfg|",
    "        flags = cfg.build_settings['OTHER_LDFLAGS'] || '$(inherited)'",
    "        flags = flags.join(' ') if flags.is_a?(Array)",
    "        unless flags.include?('SwiftUICore')",
    "          cfg.build_settings['OTHER_LDFLAGS'] = flags + ' -weak_framework SwiftUICore'",
    "        end",
    "      end",
    "    end",
    "    aggregate_target.user_project.save",
    "  end",
    PATCH_END,
  ].join("\n");
}

module.exports = function withSwiftUICoreWeakLink(config) {
  return withPodfile(config, (config) => {
    let podfile = config.modResults.contents;

    if (!/^\s*post_install\s+do\s+\|installer\|/m.test(podfile)) {
      podfile += "\n\npost_install do |installer|\nend\n";
    }

    const patch = buildPatch();

    if (podfile.includes(PATCH_START)) {
      podfile = podfile.replace(
        new RegExp(`${PATCH_START}[\\s\\S]*?${PATCH_END}`),
        patch,
      );
    } else {
      podfile = podfile.replace(
        /^\s*post_install\s+do\s+\|installer\|.*$/m,
        (match) => `${match}\n\n${patch}`,
      );
    }

    console.log("✅  withSwiftUICoreWeakLink: Podfile updated");
    config.modResults.contents = podfile;
    return config;
  });
};
