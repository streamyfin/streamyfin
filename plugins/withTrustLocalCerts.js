const { AndroidConfig, withAndroidManifest } = require("expo/config-plugins");
const path = require("node:path");
const fs = require("node:fs");
const fsPromises = fs.promises;

const { getMainApplicationOrThrow } = AndroidConfig.Manifest;

const withTrustLocalCerts = (config) => {
  return withAndroidManifest(config, async (mod) => {
    mod.modResults = await setCustomConfigAsync(mod, mod.modResults);
    return mod;
  });
};

async function setCustomConfigAsync(config, androidManifest) {
  const src_file_path = path.join(__dirname, "network_security_config.xml");
  const res_file_path = path.join(
    await AndroidConfig.Paths.getResourceFolderAsync(
      config.modRequest.projectRoot,
    ),
    "xml",
    "network_security_config.xml",
  );

  const res_dir = path.resolve(res_file_path, "..");

  if (!fs.existsSync(res_dir)) {
    await fsPromises.mkdir(res_dir);
  }

  try {
    await fsPromises.copyFile(src_file_path, res_file_path);
  } catch (e) {
    throw new Error(
      `Failed to copy network security config file from ${src_file_path} to ${res_file_path}. [Hint: Check Android write permissions and file paths]`,
      { cause: e },
    );
  }
  const mainApplication = getMainApplicationOrThrow(androidManifest);
  if (!mainApplication.$["android:networkSecurityConfig"]) {
    mainApplication.$["android:networkSecurityConfig"] =
      "@xml/network_security_config";
  }

  return androidManifest;
}

module.exports = withTrustLocalCerts;
