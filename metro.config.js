// Learn more https://docs.expo.io/guides/customizing-metro
// getSentryExpoConfig wraps expo/metro-config's getDefaultConfig and adds
// debug-ID injection so uploaded source maps match released bundles.
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getSentryExpoConfig(__dirname);

// Add Hermes parser
config.transformer.hermesParser = true;

// Evaluate a module on first use instead of at import, so the player, cast and
// TV graphs stay unevaluated until a screen needs them. Only named imports are
// inlined. Default and namespace imports compile to `_interopDefault(require())`
// and `_interopNamespace(require())`, which the inliner does not match, so they
// stay eager. A bare `import "x"` stays a plain `require("x")` in its position,
// except when the file also names a specifier of "x": the two merge into one
// inlined binding. Expo Router's sync context map defines each route as a lazy
// getter, so a route loads when the router reads it: the layouts and the
// children of each rendered navigator, not all of `app/`.
const defaultGetTransformOptions = config.transformer.getTransformOptions;
config.transformer.getTransformOptions = async (...args) => {
  const options = await defaultGetTransformOptions(...args);
  return {
    ...options,
    transform: { ...options.transform, inlineRequires: true },
  };
};

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

module.exports = config;
