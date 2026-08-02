// Learn more https://docs.expo.io/guides/customizing-metro
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add Hermes parser
config.transformer.hermesParser = true;

// When enabled, the optional code below will allow Metro to resolve
// and bundle source files with TV-specific extensions
// (e.g., *.ios.tv.tsx, *.android.tv.tsx, *.tv.tsx)
//
// Metro will still resolve source files with standard extensions
// as usual if TV-specific files are not found for a module.
//
if (process.env?.EXPO_TV === "1") {
  const originalSourceExts = config.resolver.sourceExts;
  const tvSourceExts = [
    ...originalSourceExts.map((e) => `tv.${e}`),
    ...originalSourceExts,
  ];
  config.resolver.sourceExts = tvSourceExts;
}

// config.resolver.unstable_enablePackageExports = false;

// --- Desktop (web) build -----------------------------------------------------
// These packages are native-only: they ship iOS/Android code with no
// react-native-web implementation, so Metro cannot resolve them for the web
// bundle the Electron desktop client loads. Each is redirected to a shim in
// web-shims/ that keeps the API surface but degrades the behaviour — see the
// header comment in each shim for exactly what is lost.
//
const WEB_SHIMS = {
  "react-native-track-player": "react-native-track-player.ts",
  "react-native-google-cast": "react-native-google-cast.tsx",
  "react-native-device-info": "react-native-device-info.ts",
  "react-native-glass-effect-view": "react-native-glass-effect-view.tsx",
  "@bottom-tabs/react-navigation": "bottom-tabs-react-navigation.tsx",
  "react-native-bottom-tabs": "bottom-tabs-react-navigation.tsx",
  // Native-only; throws UnavailabilityError on web, which breaks saving an
  // account. The shim delegates to the Electron OS keystore.
  "expo-secure-store": "expo-secure-store.ts",
};

// Local Expo modules under modules/ also need redirecting, and they need it
// explicitly: the `@/…` alias is resolved by Metro's tsconfig-paths support,
// which maps straight onto `modules/<name>/index.ts` without going through the
// platform-extension lookup that would otherwise pick up an `index.web.tsx`
// sibling. Left implicit, the native views get bundled and the app dies on load
// with "requireNativeViewManager is not available on web".
const LOCAL_WEB_MODULES = {
  "@/modules": "modules/index.web.ts",
  "@/modules/mpv-player": "modules/mpv-player/index.web.tsx",
  "@/modules/exoplayer-player": "modules/exoplayer-player/index.web.tsx",
  "@/modules/glass-poster": "modules/glass-poster/index.web.tsx",
  "@/modules/tv-search": "modules/tv-search/index.web.tsx",
};

const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web") {
    const shim = WEB_SHIMS[moduleName];
    if (shim) {
      return {
        type: "sourceFile",
        filePath: path.resolve(__dirname, "web-shims", shim),
      };
    }
    const local = LOCAL_WEB_MODULES[moduleName];
    if (local) {
      return { type: "sourceFile", filePath: path.resolve(__dirname, local) };
    }
  }
  return upstreamResolveRequest
    ? upstreamResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
