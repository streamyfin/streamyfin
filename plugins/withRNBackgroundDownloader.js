const { withAppDelegate, withXcodeProject } = require("@expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

/** @param {import("@expo/config-plugins").ExpoConfig} config */
function withRNBackgroundDownloader(config) {
  /* 1️⃣  Add handleEventsForBackgroundURLSession to AppDelegate.swift */
  config = withAppDelegate(config, (mod) => {
    const tag = "handleEventsForBackgroundURLSession";
    if (!mod.modResults.contents.includes(tag)) {
      mod.modResults.contents = mod.modResults.contents.replace(
        /\}\s*$/, // insert before final }
        `
  func application(
    _ application: UIApplication,
    handleEventsForBackgroundURLSession identifier: String,
    completionHandler: @escaping () -> Void
  ) {
    RNBackgroundDownloader.setCompletionHandlerWithIdentifier(identifier, completionHandler: completionHandler)
  }
}`,
      );
    }
    return mod;
  });

  /* 2️⃣  Ensure bridging header exists & is attached to *every* app target */
  config = withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const projectName = config.name || "App";
    // Fix: Go up one more directory to get to ios/, not ios/ProjectName.xcodeproj/
    const iosDir = path.dirname(path.dirname(project.filepath));
    const headerRel = `${projectName}/${projectName}-Bridging-Header.h`;
    const headerAbs = path.join(iosDir, headerRel);

    // create / append import if missing
    let headerText = "";
    try {
      headerText = fs.readFileSync(headerAbs, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
    if (!headerText.includes("RNBackgroundDownloader.h")) {
      fs.mkdirSync(path.dirname(headerAbs), { recursive: true });
      fs.appendFileSync(headerAbs, '#import "RNBackgroundDownloader.h"\n');
    }

    // Expo 53's xcode‑js doesn't expose pbxTargets().
    // Setting the property once at the project level is sufficient.
    ["Debug", "Release"].forEach((cfg) =>
      project.updateBuildProperty(
        "SWIFT_OBJC_BRIDGING_HEADER",
        "Streamyfin/Streamyfin-Bridging-Header.h",
        cfg,
      ),
    );

    return mod;
  });

  return config;
}

module.exports = withRNBackgroundDownloader;
