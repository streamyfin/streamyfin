const { withPodfile } = require("expo/config-plugins");

// Without `useFrameworks: static`, older Obj-C pods that do `#import <React/...>`
// (e.g. react-native-udp's UdpSockets.m -> <React/RCTAssert.h>) can't resolve the
// React umbrella. `use_modular_headers!` restores module-style header maps for all
// pods so <React/...> resolves again. Inserted at the top of the main target.
const MARKER = "use_modular_headers! # streamyfin: <React/...> for legacy pods";

module.exports = function withModularHeaders(config) {
  return withPodfile(config, (config) => {
    let podfile = config.modResults.contents;

    if (!podfile.includes(MARKER)) {
      podfile = podfile.replace(
        /^(target\s+['"][^'"]+['"]\s+do)\s*$/m,
        (match) => `${match}\n  ${MARKER}`,
      );
      config.modResults.contents = podfile;
      console.log("✅  withModularHeaders: use_modular_headers! injected");
    }

    return config;
  });
};
