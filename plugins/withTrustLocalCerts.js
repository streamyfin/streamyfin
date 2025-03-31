const { AndroidConfig, withAndroidManifest } = require("@expo/config-plugins");
const { Paths } = require("@expo/config-plugins/build/android");
const path = require("node:path");
const fs = require("node:fs");
const fsPromises = fs.promises;

const { getMainApplicationOrThrow } = AndroidConfig.Manifest;

const withTrustLocalCerts = (config) => {
  return withAndroidManifest(config, async (config) => {
    config.modResults = await setCustomConfigAsync(config, config.modResults);
    return config;
  });
};

async function setCustomConfigAsync(config, androidManifest) {
  const src_file_path = path.join(__dirname, "network_security_config.xml");
  const res_file_path = path.join(
    await Paths.getResourceFolderAsync(config.modRequest.projectRoot),
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
      `Failed to copy network security config file from ${src_file_path} to ${res_file_path}: ${e.message}`,
    );
  }
  const mainApplication = getMainApplicationOrThrow(androidManifest);
  mainApplication.$["android:networkSecurityConfig"] =
    "@xml/network_security_config";

  return androidManifest;
}

module.exports = withTrustLocalCerts;
