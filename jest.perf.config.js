const base = require("./jest.config");

// `expo-router` is mocked explicitly by the scenarios, `react-i18next` must
// translate for real, and the file-system and icon doubles would stand in for
// the real packages. The unit setup file (`ServerImage`, haptics, the device
// id) is replaced below, so the scenarios measure the real modules.
const {
  "^expo-router$": _expoRouter,
  "^react-i18next$": _i18next,
  "^expo-file-system$": _fileSystem,
  "^@expo/vector-icons$": _vectorIcons,
  ...moduleNameMapper
} = base.moduleNameMapper;

module.exports = {
  ...base,
  moduleNameMapper,
  setupFilesAfterEnv: ["<rootDir>/test-utils/perfSetup.ts"],
  // Reassure runs each scenario 11 times, which outlasts the default 5s.
  testTimeout: 60_000,
};
