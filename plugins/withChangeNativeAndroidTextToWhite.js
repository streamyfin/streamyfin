const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { withDangerousMod } = require("@expo/config-plugins");

const withChangeNativeAndroidTextToWhite = (expoConfig) =>
  withDangerousMod(expoConfig, [
    "android",
    (modConfig) => {
      if (modConfig.modRequest.platform === "android") {
        const stylesXmlPath = join(
          modConfig.modRequest.platformProjectRoot,
          "app",
          "src",
          "main",
          "res",
          "values",
          "styles.xml",
        );

        let stylesXml = readFileSync(stylesXmlPath, "utf8");

        stylesXml = stylesXml.replace(
          /@android:color\/black/g,
          "@android:color/white",
        );

        writeFileSync(stylesXmlPath, stylesXml, { encoding: "utf8" });
      }
      return modConfig;
    },
  ]);

module.exports = withChangeNativeAndroidTextToWhite;
