const { jest: base } = require("./package.json");

// These stand-ins in the unit config are for specs that want a cheap double.
// The scenarios measure the real thing, or rewire the auto-mocks they already
// use: `expo-router` is mocked explicitly, `react-i18next` must translate for
// real, the settings atoms must cost what they cost in the app, and a scenario that
// does not mock `ServerImage` measures the real one.
const {
  "^expo-router$": _expoRouter,
  "^react-i18next$": _i18next,
  "^@/utils/atoms/settings$": _settings,
  "^@/components/common/ServerImage$": _serverImage,
  ...moduleNameMapper
} = base.moduleNameMapper;

module.exports = {
  ...base,
  moduleNameMapper,
  setupFilesAfterEnv: ["<rootDir>/test-utils/perfSetup.ts"],
  // Reassure runs each scenario 11 times, which outlasts the default 5s.
  testTimeout: 60_000,
};
