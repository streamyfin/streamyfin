/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  collectCoverageFrom: [
    "**/*.{ts,tsx}",
    "!**/node_modules/**",
    "!**/android/**",
    "!**/ios/**",
    "!**/.expo/**",
    "!**/coverage/**",
  ],
  testPathIgnorePatterns: ["/node_modules/", "/android/", "/ios/", "/.expo/"],
};
