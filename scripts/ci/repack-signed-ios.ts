/**
 * Repacks a signed IPA with this commit's JS, signed with the files that
 * fetch-ios-credentials.ts wrote.
 *
 * It goes through repack-app's API because its CLI cannot keep the app's
 * entitlements: zsign would sign each target with its profile's, which list
 * every group the profile allows (a wildcard keychain group, the Top Shelf's
 * app group) and not the ones the app was built with. A keychain group that
 * changes can hide what the app stored in the keychain.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { repackAppIosAsync } from "@expo/repack-app";

/** zsign signing with the app's own entitlements, from `<dir>`. */
export const signingOptions = (signingDir: string) => ({
  backend: "zsign" as const,
  certificatePath: path.join(signingDir, "identity.p12"),
  keyPassword: readFileSync(path.join(signingDir, "password"), "utf8"),
  provisioningProfile: JSON.parse(
    readFileSync(path.join(signingDir, "profiles.json"), "utf8"),
  ) as Record<string, string>,
  useAppEntitlements: true,
});

/**
 * Usage: `bun scripts/ci/repack-signed-ios.ts <source ipa> <signing dir>
 * <output ipa> <working dir>`, from the project root, with the environment
 * the repack needs (NODE_ENV, EXPO_TV, REPACK_IOS_BUILD_NUMBER).
 */
const main = async () => {
  const [sourceAppPath, signingDir, outputPath, workingDirectory] =
    process.argv.slice(2);
  await repackAppIosAsync({
    platform: "ios",
    projectRoot: process.cwd(),
    sourceAppPath,
    outputPath,
    workingDirectory,
    iosSigningOptions: signingOptions(signingDir),
  });
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
