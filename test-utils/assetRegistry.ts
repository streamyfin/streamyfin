// jest-expo 58 mocks `react-native/asset-registry`, but on React Native 0.88
// `import { AssetRegistry } from "react-native"` (what expo-asset reads since
// 58.0.16) loads the private module directly, so the mock never reaches it and
// every rendered @expo/vector-icons icon throws "Module 1 is missing from the
// asset registry". Point the private module at the same mock until jest-expo
// ships the fix (expo/expo#51834, expo/expo#52048).
const path = require("node:path");

// An absolute path: react-native's `exports` map does not list `src/private`.
jest.doMock(
  path.join(
    path.dirname(require.resolve("react-native/package.json")),
    "src/private/assets/AssetRegistry.js",
  ),
  () => ({ AssetRegistry: jest.requireMock("react-native/asset-registry") }),
);
