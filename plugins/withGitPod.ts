import { type ConfigPlugin, withPodfile } from "expo/config-plugins";

interface GitPodOptions {
  podName: string;
  podspecUrl: string;
}

const withGitPod: ConfigPlugin<GitPodOptions> = (
  config,
  { podName, podspecUrl },
) => {
  return withPodfile(config, (config) => {
    const podfile = config.modResults.contents;

    const podLine = `  pod '${podName}', :podspec => '${podspecUrl}'`;

    // Check if already added
    if (podfile.includes(podLine)) {
      return config;
    }

    // Insert after "use_expo_modules!"
    config.modResults.contents = podfile.replace(
      "use_expo_modules!",
      `use_expo_modules!\n${podLine}`,
    );

    return config;
  });
};

export default withGitPod;
