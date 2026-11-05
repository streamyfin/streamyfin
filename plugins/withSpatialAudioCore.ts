import { type ConfigPlugin, withXcodeProject } from "expo/config-plugins";

const PHASE_NAME = "Embed SpatialAudioCore";

/**
 * SpatialAudioBridge 2 ships its core as a dynamic framework. The mpv player
 * pod links it through Swift Package Manager, but CocoaPods only embeds pod
 * frameworks and Xcode embeds a package's framework only in a target that
 * depends on the package itself, so nothing put it in the app and the app
 * failed to launch. This phase copies and signs it as CocoaPods' embed script
 * does for pod frameworks.
 */
const SCRIPT = `set -e
framework="\${PODS_CONFIGURATION_BUILD_DIR}/SpatialAudioCore.framework"
destination="\${TARGET_BUILD_DIR}/\${FRAMEWORKS_FOLDER_PATH}"
mkdir -p "$destination"
rsync -a --delete "$framework" "$destination/"
if [ -n "\${EXPANDED_CODE_SIGN_IDENTITY:-}" ] && [ "\${CODE_SIGNING_REQUIRED:-}" != "NO" ] && [ "\${CODE_SIGNING_ALLOWED}" != "NO" ]; then
  codesign --force --sign "\${EXPANDED_CODE_SIGN_IDENTITY}" \${OTHER_CODE_SIGN_FLAGS:-} --preserve-metadata=identifier,entitlements "$destination/SpatialAudioCore.framework"
fi
`;

const withSpatialAudioCore: ConfigPlugin = (config) =>
  withXcodeProject(config, (config) => {
    const project = config.modResults;
    const target = project.getFirstTarget().uuid;
    const exists = project.buildPhaseObject(
      "PBXShellScriptBuildPhase",
      PHASE_NAME,
      target,
    );
    if (!exists) {
      project.addBuildPhase(
        [],
        "PBXShellScriptBuildPhase",
        PHASE_NAME,
        target,
        {
          shellPath: "/bin/sh",
          // The xcode package escapes quotes but writes newlines as they are.
          shellScript: SCRIPT.replace(/\n/g, "\\n"),
          inputPaths: [
            '"$(PODS_CONFIGURATION_BUILD_DIR)/SpatialAudioCore.framework"',
          ],
          outputPaths: [
            '"$(TARGET_BUILD_DIR)/$(FRAMEWORKS_FOLDER_PATH)/SpatialAudioCore.framework"',
          ],
        },
      );
    }
    return config;
  });

export default withSpatialAudioCore;
