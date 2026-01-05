#!/usr/bin/env node
/**
 * Post-prebuild script to fix widget icon build settings
 * Run this after `bun run prebuild`
 */
const fs = require("node:fs");
const path = require("node:path");

const projectPath = path.join(
  __dirname,
  "..",
  "ios",
  "Streamyfin.xcodeproj",
  "project.pbxproj",
);

if (!fs.existsSync(projectPath)) {
  console.log("⚠️ iOS project not found - skipping widget icon fix");
  process.exit(0);
}

const contents = fs.readFileSync(projectPath, "utf-8");

// Find widget build configurations and add ASSETCATALOG_COMPILER_APPICON_NAME
const widgetBgColorPattern =
  /ASSETCATALOG_COMPILER_WIDGET_BACKGROUND_COLOR_NAME = \$widgetBackground;/g;

const matches = contents.match(widgetBgColorPattern);

if (!matches || matches.length === 0) {
  console.log("⚠️ No widget configurations found");
  process.exit(0);
}

console.log(`🔧 Found ${matches.length} widget configurations`);

const newContents = contents.replace(
  widgetBgColorPattern,
  `ASSETCATALOG_COMPILER_WIDGET_BACKGROUND_COLOR_NAME = $widgetBackground;
				ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;`,
);

if (newContents !== contents) {
  fs.writeFileSync(projectPath, newContents);
  console.log("✅ Widget icon fix applied successfully!");
} else {
  console.log("⚠️ No changes needed");
}
