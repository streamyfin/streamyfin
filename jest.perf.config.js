const base = require("./jest.config");

// `expo-router` is mocked explicitly by the scenarios, and `react-i18next` must
// translate for real. The unit setup file (settings, `ServerImage`, network
// status) is replaced below, so the scenarios measure the real modules.
const {
  "^expo-router$": _expoRouter,
  "^react-i18next$": _i18next,
  ...moduleNameMapper
} = base.moduleNameMapper;

module.exports = {
  ...base,
  moduleNameMapper,
  setupFilesAfterEnv: ["<rootDir>/test-utils/perfSetup.ts"],
  // Reassure runs each scenario 11 times, which outlasts the default 5s.
  testTimeout: 60_000,
};
