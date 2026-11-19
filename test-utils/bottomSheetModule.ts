// The library's own Jest mock. `moduleNameMapper` wires it for every spec so the
// real module, which needs Reanimated's worklet runtime, is never loaded.
module.exports = jest.requireActual(
  "../node_modules/@gorhom/bottom-sheet/mock",
);
