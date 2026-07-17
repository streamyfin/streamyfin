import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type ConfigPlugin, withDangerousMod } from "expo/config-plugins";

const withChangeNativeAndroidTextToWhite: ConfigPlugin = (expoConfig) =>
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

export default withChangeNativeAndroidTextToWhite;
