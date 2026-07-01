import type { ExpoConfig } from "expo/config";
import {
  AndroidConfig,
  type ConfigPlugin,
  withGradleProperties,
} from "expo/config-plugins";

function setGradlePropertiesValue(
  config: ExpoConfig,
  key: string,
  value: string,
): ExpoConfig {
  return withGradleProperties(config, (exportedConfig) => {
    const props = exportedConfig.modResults;
    const keyIdx = props.findIndex(
      (item) => item.type === "property" && item.key === key,
    );
    const property: AndroidConfig.Properties.PropertiesItem = {
      type: "property",
      key,
      value,
    };

    if (keyIdx >= 0) {
      props.splice(keyIdx, 1, property);
    } else {
      props.push(property);
    }

    return exportedConfig;
  });
}

const withCustomGradleProperties: ConfigPlugin = (config) => {
  // Expo 52 is not setting this
  // https://github.com/expo/expo/issues/32558
  config = setGradlePropertiesValue(config, "android.enableJetifier", "true");

  // NDK version required by libmpv 1.0.0
  config = setGradlePropertiesValue(config, "ndkVersion", "29.0.14206865");

  // Increase memory
  config = setGradlePropertiesValue(
    config,
    "org.gradle.jvmargs",
    "-Xmx4096m -XX:MaxMetaspaceSize=1024m",
  );
  return config;
};

export default withCustomGradleProperties;
