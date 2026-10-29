const { jest: base } = require("./package.json");

module.exports = {
  ...base,
  // The base setup files stay, the asset registry fix among them: without it
  // every rendered icon throws.
  setupFilesAfterEnv: [
    ...base.setupFilesAfterEnv,
    "<rootDir>/test-utils/perfSetup.ts",
  ],
  // Reassure runs each scenario 11 times, which outlasts the default 5s.
  testTimeout: 60_000,
};
