const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  __dirname,
  "..",
  "node_modules",
  "react-native-bottom-tabs",
  "lib",
  "module",
  "TabView.js",
);

try {
  let content = fs.readFileSync(filePath, "utf8");

  if (content.includes("// Polyfill for Image.resolveAssetSource")) {
    console.log("✓ react-native-bottom-tabs already patched");
    process.exit(0);
  }

  const patchCode = `
// Polyfill for Image.resolveAssetSource if not available
if (!Image.resolveAssetSource) {
  const resolveAssetSourceModule = require('react-native/Libraries/Image/resolveAssetSource');
  Image.resolveAssetSource = resolveAssetSourceModule.default || resolveAssetSourceModule;
}
`;

  content = content.replace(
    `import { Image, Platform, StyleSheet, View, processColor } from 'react-native';
import { BottomTabBarHeightContext }`,
    `import { Image, Platform, StyleSheet, View, processColor } from 'react-native';
${patchCode}import { BottomTabBarHeightContext }`,
  );

  fs.writeFileSync(filePath, content, "utf8");
  console.log("✓ Successfully patched react-native-bottom-tabs");
} catch (error) {
  console.error("Failed to patch react-native-bottom-tabs:", error.message);
}
