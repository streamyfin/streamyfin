// `react-i18next` itself. `moduleNameMapper` swaps the package for an identity
// `t`, and the package's `exports` map hides this path from a plain require.
module.exports = jest.requireActual(
  "../node_modules/react-i18next/dist/commonjs/index.js",
);
