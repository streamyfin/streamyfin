const { jest: base } = require("./package.json");

// The expo-router stub in the unit config is for specs that opt in with an
// explicit jest.mock; mapping it globally here rewires the auto-mocks these
// scenarios already use.
const { "^expo-router$": _expoRouter, ...moduleNameMapper } =
  base.moduleNameMapper;

module.exports = {
  ...base,
  moduleNameMapper,
  // The unit config's own setup files, if it has any, run here too.
  setupFilesAfterEnv: [
    ...(base.setupFilesAfterEnv ?? []),
    "<rootDir>/test-utils/perfSetup.ts",
  ],
  // Reassure runs each scenario 11 times, which outlasts the default 5s.
  testTimeout: 60_000,
};
