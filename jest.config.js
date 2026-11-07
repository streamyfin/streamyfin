module.exports = {
  preset: "jest-expo",
  clearMocks: true,
  globalSetup: "<rootDir>/test-utils/timeZone.ts",
  setupFilesAfterEnv: ["<rootDir>/test-utils/unitSetup.ts"],
  moduleNameMapper: {
    "^tsx/cjs$": "<rootDir>/test-utils/tsxRequireHook.ts",
    "^expo-file-system$": "<rootDir>/test-utils/fileSystemModule.ts",
    "^expo-router$": "<rootDir>/test-utils/expoRouterModule.ts",
    "^@expo/vector-icons$": "<rootDir>/test-utils/vectorIconsModule.ts",
    "^react-native-mmkv$": "<rootDir>/test-utils/mmkvModule.ts",
    "^react-i18next$": "<rootDir>/test-utils/i18nextModule.ts",
    "^@gorhom/bottom-sheet$": "<rootDir>/test-utils/bottomSheetModule.ts",
    "^@react-native-community/netinfo$":
      "<rootDir>/node_modules/@react-native-community/netinfo/jest/netinfo-mock.js",
    "^react-native-device-info$":
      "<rootDir>/node_modules/react-native-device-info/jest/react-native-device-info-mock.js",
    "^react-native-safe-area-context$":
      "<rootDir>/test-utils/safeAreaModule.ts",
  },
  transformIgnorePatterns: [
    "node_modules/(?!(.bun|(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/.*|@jellyfin/sdk|@shopify/flash-list|native-base|react-native-svg))",
  ],
  collectCoverageFrom: [
    "utils/**/*.{ts,tsx}",
    "hooks/**/*.{ts,tsx}",
    "providers/**/*.{ts,tsx}",
    "components/**/*.{ts,tsx}",
    "!**/*.test.{ts,tsx}",
    "!**/*.perf-test.{ts,tsx}",
    "!utils/jellyseerr/**",
  ],
};
