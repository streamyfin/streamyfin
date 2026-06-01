#!/usr/bin/env node

// Symlinks the platform-specific native dirs to `ios` / `android` depending on EXPO_TV.
// Uses fs APIs (no shell) so there is no command-injection surface.

const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const isTV = process.env.EXPO_TV && process.env.EXPO_TV !== "0";

const links = isTV
  ? { ios: path.join(root, "iostv"), android: path.join(root, "androidtv") }
  : {
      ios: path.join(root, "iosmobile"),
      android: path.join(root, "androidmobile"),
    };

for (const [link, target] of Object.entries(links)) {
  fs.mkdirSync(target, { recursive: true });
  try {
    fs.unlinkSync(link); // replace an existing symlink/file (ln -nsf)
  } catch {
    // nothing to remove
  }
  fs.symlinkSync(target, link);
  console.log(`${link} -> ${target}`);
}
