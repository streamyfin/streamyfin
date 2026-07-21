const path = require("node:path");

// AOT-compile worklets to Hermes bytecode in production builds: evaluating
// worklet source strings at runtime keeps their eval'd copies resident and
// inflates Hermes memory (reanimated 4 regression). Precompiled bytecode
// skips that evaluation. hermesc ships per-OS in the hermes-compiler package.
const getHBCBinary = () => {
  const hermescDir = path.join(
    path.dirname(require.resolve("hermes-compiler/package.json")),
    "hermesc",
  );
  switch (process.platform) {
    case "win32":
      return path.join(hermescDir, "win64-bin", "hermesc.exe");
    case "darwin":
      return path.join(hermescDir, "osx-bin", "hermesc");
    default:
      return path.join(hermescDir, "linux64-bin", "hermesc");
  }
};

module.exports = (api) => {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      "nativewind/babel",
      ["react-native-worklets/plugin", { hermesBytecode: true, getHBCBinary }],
    ],
  };
};
