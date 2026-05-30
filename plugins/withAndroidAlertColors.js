const {
  withAndroidColors,
  withAndroidColorsNight,
} = require("expo/config-plugins");

const withAndroidAlertColors = (config) => {
  const setColor = (colorsList, name, value) => {
    const existingColor = colorsList.find(
      (item) => item.$ && item.$.name === name,
    );
    if (existingColor) {
      existingColor._ = value;
    } else {
      colorsList.push({
        $: { name },
        _: value,
      });
    }
  };

  config = withAndroidColors(config, (config) => {
    const colors = config.modResults;
    const colorsList = colors.resources.color || [];
    setColor(colorsList, "colorPrimary", "#000000");
    colors.resources.color = colorsList;
    return config;
  });

  config = withAndroidColorsNight(config, (config) => {
    const colors = config.modResults;
    const colorsList = colors.resources.color || [];
    setColor(colorsList, "colorPrimary", "#FFFFFF");
    colors.resources.color = colorsList;
    return config;
  });

  return config;
};

module.exports = withAndroidAlertColors;
