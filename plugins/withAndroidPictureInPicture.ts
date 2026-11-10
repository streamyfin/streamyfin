import { type ConfigPlugin, withAndroidManifest } from "expo/config-plugins";

interface ManifestActivity {
  $?: Record<string, string>;
}

interface ManifestLike {
  manifest: {
    application?: { activity?: ManifestActivity[] }[];
  };
}

/**
 * Flags `.MainActivity` for picture in picture: the player's PiP control needs it, and
 * nothing else in the generated manifest sets it. Exported on its own so a test can run
 * it without expo/config-plugins.
 */
export const enablePictureInPicture = (manifest: ManifestLike): void => {
  const mainActivity = manifest.manifest.application?.[0]?.activity?.find(
    (activity) => activity.$?.["android:name"] === ".MainActivity",
  );
  if (mainActivity?.$) {
    mainActivity.$["android:supportsPictureInPicture"] = "true";
  }
};

const withAndroidPictureInPicture: ConfigPlugin = (config) =>
  withAndroidManifest(config, async (mod) => {
    enablePictureInPicture(mod.modResults as unknown as ManifestLike);
    return mod;
  });

export default withAndroidPictureInPicture;
