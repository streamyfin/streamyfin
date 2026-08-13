import {
  type ConfigPlugin,
  withAndroidColors,
  withAndroidColorsNight,
} from "expo/config-plugins";

interface ColorResourceItem {
  $: { name: string };
  _: string;
}

const withAndroidAlertColors: ConfigPlugin = (config) => {
  const setColor = (
    colorsList: ColorResourceItem[],
    name: string,
    value: string,
  ) => {
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
    const colorsList = (colors.resources.color ?? []) as ColorResourceItem[];
    setColor(colorsList, "colorPrimary", "#000000");
    colors.resources.color = colorsList;
    return config;
  });

  config = withAndroidColorsNight(config, (config) => {
    const colors = config.modResults;
    const colorsList = (colors.resources.color ?? []) as ColorResourceItem[];
    setColor(colorsList, "colorPrimary", "#FFFFFF");
    colors.resources.color = colorsList;
    return config;
  });

  return config;
};

export default withAndroidAlertColors;
