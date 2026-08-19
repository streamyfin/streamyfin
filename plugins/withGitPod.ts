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
    const podLine = `  pod '${podName}', :podspec => '${podspecUrl}'`;

    // Drop any existing declaration for this pod before inserting. The guard
    // here used to compare the whole line, podspec URL included, so bumping the
    // URL left the old line sitting next to the new one and `pod install` failed
    // with conflicting sources for the same pod. Only shows up on a prebuild
    // that reuses an existing ios/, since a clean one has no line to collide
    // with, which is why it went unnoticed until the 0.41.0-av2 -> av3 bump.
    const escapedName = podName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const existingPod = new RegExp(
      `^[ \\t]*pod ['"]${escapedName}['"].*$\\n?`,
      "gm",
    );
    const podfile = config.modResults.contents.replace(existingPod, "");

    // Insert after "use_expo_modules!"
    config.modResults.contents = podfile.replace(
      "use_expo_modules!",
      `use_expo_modules!\n${podLine}`,
    );

    return config;
  });
};

export default withGitPod;
