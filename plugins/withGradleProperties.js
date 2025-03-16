const { withGradleProperties } = require("expo/config-plugins");

function setGradlePropertiesValue(config, key, value) {
  return withGradleProperties(config, (exportedConfig) => {
    const props = exportedConfig.modResults;
    const keyIdx = props.findIndex(
      (item) => item.type === "property" && item.key === key,
    );
    const property = {
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

module.exports = function withCustomPlugin(config) {
  // Expo 52 is not setting this
  // https://github.com/expo/expo/issues/32558
  config = setGradlePropertiesValue(config, "android.enableJetifier", "true");

  // Increase memory
  config = setGradlePropertiesValue(
    config,
    "org.gradle.jvmargs",
    "-Xmx4096m -XX:MaxMetaspaceSize=1024m",
  );
  return config;
};
