const { withPodfile } = require("expo/config-plugins");

const PATCH_START = "## >>> runtime-framework headers";
const PATCH_END = "## <<< runtime-framework headers";

const EXTRA_HDRS = [
  `\${PODS_CONFIGURATION_BUILD_DIR}/React-RuntimeApple/React_RuntimeApple.framework/Headers`,
  `\${PODS_CONFIGURATION_BUILD_DIR}/React-RuntimeCore/React_RuntimeCore.framework/Headers`,
  `\${PODS_CONFIGURATION_BUILD_DIR}/React-jserrorhandler/React_jserrorhandler.framework/Headers`,
  `\${PODS_CONFIGURATION_BUILD_DIR}/React-jsinspector/jsinspector_modern.framework/Headers`,
  `\${PODS_CONFIGURATION_BUILD_DIR}/React-runtimescheduler/React_runtimescheduler.framework/Headers`,
  `\${PODS_CONFIGURATION_BUILD_DIR}/React-performancetimeline/React_performancetimeline.framework/Headers`,
  `\${PODS_CONFIGURATION_BUILD_DIR}/React-rendererconsistency/React_rendererconsistency.framework/Headers`,
];

function buildPatch() {
  return [
    PATCH_START,
    "  extra_hdrs = [",
    ...EXTRA_HDRS.map((h) => `    "${h}",`),
    "  ]",
    "",
    "  installer.pods_project.targets.each do |t|",
    "    t.build_configurations.each do |cfg|",
    "      cfg.build_settings['HEADER_SEARCH_PATHS'] ||= '$(inherited)'",
    "      cfg.build_settings['HEADER_SEARCH_PATHS']  << \" #{extra_hdrs.join(' ')}\"",
    "    end",
    "  end",
    PATCH_END,
  ].join("\n");
}

module.exports = function withRuntimeFrameworkHeaders(config) {
  return withPodfile(config, (config) => {
    let podfile = config.modResults.contents;

    // 1️⃣ ensure there's a post_install block
    if (!/^\s*post_install\s+do\s+\|installer\|/m.test(podfile)) {
      podfile += `

post_install do |installer|
end
`;
    }

    const patch = buildPatch();

    if (podfile.includes(PATCH_START)) {
      // 🔄 update existing patch
      podfile = podfile.replace(
        new RegExp(`${PATCH_START}[\\s\\S]*?${PATCH_END}`),
        patch,
      );
    } else {
      // ➕ insert right after the post_install opening line
      podfile = podfile.replace(
        /^\s*post_install\s+do\s+\|installer\|.*$/m,
        (match) => `${match}\n\n${patch}`,
      );
    }

    console.log("✅  with-runtime-framework-headers: Podfile updated");
    config.modResults.contents = podfile;
    return config;
  });
};
