import { type ConfigPlugin, withPodfile } from "expo/config-plugins";

/** CocoaPods resolves the pinned source pod; no fetched native source is vendored. */
const withDownloadRemuxer: ConfigPlugin = (config) =>
  withPodfile(config, (config) => {
    const declaration =
      "  pod 'StreamyfinLibwebm', :podspec => '../modules/background-downloader/remux/StreamyfinLibwebm.podspec'";
    const contents = config.modResults.contents.replace(
      /^[ \t]*pod ['"]StreamyfinLibwebm['"].*\n?/gm,
      "",
    );
    if (!contents.includes("use_expo_modules!")) {
      throw new Error(
        "Cannot configure download remuxer: missing use_expo_modules!",
      );
    }
    config.modResults.contents = contents.replace(
      "use_expo_modules!",
      `use_expo_modules!\n${declaration}`,
    );
    return config;
  });

export default withDownloadRemuxer;
