/** @type {import('@bacons/apple-targets').Config} */
module.exports = (config) => ({
  type: "widget",
  name: "StreamyfinWidget",
  icon: "../../assets/images/icon-ios-plain.png",
  deploymentTarget: "17.0",
  entitlements: {
    "com.apple.security.application-groups": config.ios?.entitlements?.[
      "com.apple.security.application-groups"
    ] || ["group.com.fredrikburmester.streamyfin.widgets"],
  },
  colors: {
    $accent: "#9333EA",
    $widgetBackground: {
      light: "#1a1a1a",
      dark: "#1a1a1a",
    },
  },
});
