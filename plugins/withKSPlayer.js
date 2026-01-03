const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const withKSPlayer = (config) => {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile",
      );
      let podfileContent = fs.readFileSync(podfilePath, "utf8");

      // KSPlayer and its dependencies
      const ksPlayerPods = `
  # KSPlayer dependencies (GPU acceleration + native PiP)
  pod 'KSPlayer', :git => 'https://github.com/kingslay/KSPlayer.git', :tag => '2.3.4', :modular_headers => true
  pod 'DisplayCriteria', :git => 'https://github.com/kingslay/KSPlayer.git', :tag => '2.3.4', :modular_headers => true
  pod 'FFmpegKit', :git => 'https://github.com/kingslay/FFmpegKit.git', :tag => '6.1.3', :modular_headers => true
  pod 'Libass', :git => 'https://github.com/kingslay/FFmpegKit.git', :tag => '6.1.3', :modular_headers => true
`;

      // Only add if not already present
      if (!podfileContent.includes("pod 'KSPlayer'")) {
        podfileContent = podfileContent.replace(
          /use_expo_modules!/,
          `use_expo_modules!\n${ksPlayerPods}`,
        );
        fs.writeFileSync(podfilePath, podfileContent);
      }

      return config;
    },
  ]);
};

module.exports = withKSPlayer;
