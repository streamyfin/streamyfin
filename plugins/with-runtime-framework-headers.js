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
    "      cfg.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'",
    "      # iOS 26 / Xcode 26: SwiftUI was split into SwiftUI + SwiftUICore. The SwiftUI",
    "      # pods (ExpoUI, glass-effect, glass-poster, …) emit a `-framework SwiftUICore`",
    "      # autolink directive that, under use_frameworks :static, flows into the app",
    "      # executable's link. The app isn't an allowed client of the private",
    "      # SwiftUICore.tbd → `cannot link directly with 'SwiftUICore'`. Dropping that one",
    "      # autolink at the Swift frontend lets the symbols resolve via SwiftUI's",
    "      # re-export instead. Phone-only — tvOS links fine and must stay untouched.",
    "      if ENV['EXPO_TV'] != '1'",
    "        cfg.build_settings['OTHER_SWIFT_FLAGS'] ||= '$(inherited)'",
    "        cfg.build_settings['OTHER_SWIFT_FLAGS'] << ' -Xfrontend -disable-autolink-framework -Xfrontend SwiftUICore'",
    "      end",
    "    end",
    "  end",
    "",
    "  # Safely patch RCTThirdPartyComponentsProvider.mm to avoid startup crash on unlinked Fabric components",
    '  filepath = "#{installer.sandbox.root}/../build/generated/ios/ReactCodegen/RCTThirdPartyComponentsProvider.mm"',
    "  if File.exist?(filepath)",
    "    content = File.read(filepath)",
    "    if content =~ /thirdPartyComponents = @\\{([\\s\\S]*?)\\};/",
    "      entries = $1",
    '      new_code = "NSMutableDictionary *dict = [NSMutableDictionary dictionary];\\n"',
    '      new_code += "    Class cls;\\n"',
    "      entries.each_line do |line|",
    "        line = line.strip",
    "        next if line.empty?",
    '        if line =~ /@\\"(.*?)\\":\\s*NSClassFromString\\(@\\"(.*?)\\"\\),?(.*)/',
    "          key = $1",
    "          val = $2",
    "          comment = $3",
    '          new_code += "    cls = NSClassFromString(@\\"#{val}\\"); if (cls) dict[@\\"#{key}\\"] = cls;#{comment}\\n"',
    "        else",
    '          new_code += "    // #{line}\\n"',
    "        end",
    "      end",
    '      new_code += "    thirdPartyComponents = dict;"',
    "      content = content.sub(/thirdPartyComponents = @\\{[\\s\\S]*?\\};/, new_code)",
    "      File.write(filepath, content)",
    '      puts "✅ Patched RCTThirdPartyComponentsProvider.mm for safety"',
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
