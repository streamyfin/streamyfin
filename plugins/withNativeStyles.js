const { withAndroidStyles, withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

function withNativeTabBarStyles(config) {
  // First, apply the styles modifications
  config = withAndroidStyles(config, async (config) => {
    const styleContents = config.modResults;

    // Find or create the AppTheme style
    let appTheme = styleContents.resources.style.find(
      (style) => style.$.name === "AppTheme"
    );

    if (!appTheme) {
      appTheme = {
        $: {
          name: "AppTheme",
          parent: "Theme.Material3.DayNight.NoActionBar",
        },
        item: [],
      };
      styleContents.resources.style.push(appTheme);
    } else {
      appTheme.$.parent = "Theme.Material3.DayNight.NoActionBar";
    }

    // Update or add items in the AppTheme style
    const itemsToAdd = [
      {
        name: "android:editTextBackground",
        value: "@drawable/rn_edit_text_material",
      },
      {
        name: "bottomNavigationStyle",
        value: "@style/Widget.Material3.BottomNavigationView",
      },
      {
        name: "android:navigationBarColor",
        value: "@android:color/transparent",
      },
      { name: "android:statusBarColor", value: "@android:color/transparent" },
    ];

    itemsToAdd.forEach(({ name, value }) => {
      const existingItem = appTheme.item.find((item) => item.$.name === name);
      if (existingItem) {
        existingItem._ = value;
      } else {
        appTheme.item.push({
          $: { name },
          _: value,
        });
      }
    });

    // Add custom bottom navigation style
    styleContents.resources.style.push({
      $: {
        name: "CustomBottomNavigationView",
        parent: "@style/Widget.Material3.BottomNavigationView",
      },
      item: [
        {
          $: { name: "android:layout_margin" },
          _: "16dp",
        },
        {
          $: { name: "android:background" },
          _: "@drawable/bottom_nav_background",
        },
      ],
    });

    const bottomNavigationStyleItem = appTheme.item.find(
      (item) => item.$.name === "bottomNavigationStyle"
    );
    if (bottomNavigationStyleItem) {
      bottomNavigationStyleItem._ = "@style/CustomBottomNavigationView";
    } else {
      appTheme.item.push({
        $: { name: "bottomNavigationStyle" },
        _: "@style/CustomBottomNavigationView",
      });
    }

    return {
      ...config,
      modResults: styleContents,
    };
  });

  // Then, add the drawable file creation
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const drawablePath = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "drawable"
      );
      const filePath = path.join(drawablePath, "bottom_nav_background.xml");

      const fileContent = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <solid android:color="?attr/colorSurfaceVariant" />
    <corners android:radius="28dp" />
</shape>`;

      await fs.promises.mkdir(drawablePath, { recursive: true });
      await fs.promises.writeFile(filePath, fileContent);

      return config;
    },
  ]);
}

module.exports = withNativeTabBarStyles;
