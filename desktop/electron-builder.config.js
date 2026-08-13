// electron-builder configuration.
//
// JS rather than YAML for one reason: the desktop package version is read from
// app.json, so bumping the app version is enough and the two cannot drift.
// `extraMetadata.version` overrides the version in desktop/package.json at
// build time, which is what ends up in the installer name and in the .deb
// metadata.
const appJson = require("../app.json");

module.exports = {
  appId: "app.streamyfin.desktop",
  productName: "Streamyfin",
  copyright: "Streamyfin contributors",

  extraMetadata: {
    version: appJson.expo.version,
  },

  directories: {
    output: "release",
    buildResources: "build",
  },

  // main.js/preload.js live here; the Expo web export is copied in from the
  // repo root, where `bun run build:desktop` writes it.
  files: ["main.js", "preload.js", "icon.png", "package.json"],

  // The web export goes in extraResources, NOT files/asar. Expo emits icon
  // fonts to dist-web/assets/node_modules/@expo/vector-icons/…, and
  // electron-builder filters any `node_modules` path out of the asar —
  // silently dropping every .ttf, which makes all icons render as tofu
  // squares. extraResources copies verbatim with no such filtering. main.js
  // resolves it via process.resourcesPath.
  extraResources: [{ from: "../dist-web", to: "dist-web" }],

  // The renderer is a local bundle with no native deps, so nothing to rebuild.
  npmRebuild: false,

  win: {
    target: [
      // nsis = installer with shortcuts; portable = one self-contained .exe
      // that needs no install and no runtime on the machine.
      { target: "nsis", arch: ["x64"] },
      { target: "portable", arch: ["x64"] },
    ],
    icon: "icon.png",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: electron-builder placeholder
    artifactName: "${productName}-Setup-${version}.${ext}",
  },

  portable: {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: electron-builder placeholder
    artifactName: "${productName}-${version}-portable.exe",
  },

  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "Streamyfin",
  },

  linux: {
    // .deb requires a maintainer. Deliberately the project's identity rather
    // than any individual's address: it is embedded in every package built.
    maintainer: "Streamyfin contributors <noreply@users.noreply.github.com>",
    // AppImage is the self-contained one: a single executable, no install.
    target: [
      { target: "AppImage", arch: ["x64"] },
      { target: "deb", arch: ["x64"] },
    ],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: electron-builder placeholder
    artifactName: "${productName}-${version}-${arch}.${ext}",
    category: "AudioVideo",
    icon: "icon.png",
    synopsis: "Jellyfin client",
    description: "Streamyfin desktop client for Jellyfin media servers.",
  },
};
