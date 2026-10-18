const { jest: base } = require("./package.json");

module.exports = {
  ...base,
  setupFilesAfterEnv: ["<rootDir>/test-utils/perfSetup.ts"],
};
