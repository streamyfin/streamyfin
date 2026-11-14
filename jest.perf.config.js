const base = require("./jest.config");

// The scenarios measure the real packages, so none of the unit config's
// package doubles are mapped here: a double a scenario needs is mocked in
// `test-utils/perfSetup.ts` or in the scenario, where `jest.unmock` can take it
// back. Only the `tsx/cjs` stub stays, which keeps a require hook off the Jest
// worker.
const { "^tsx/cjs$": tsxRequireHook } = base.moduleNameMapper;

module.exports = {
  ...base,
  moduleNameMapper: { "^tsx/cjs$": tsxRequireHook },
  // The unit setup file is not loaded: perfSetup takes its place.
  setupFilesAfterEnv: ["<rootDir>/test-utils/perfSetup.ts"],
  // Reassure runs each scenario 11 times, which outlasts the default 5s.
  testTimeout: 60_000,
};
