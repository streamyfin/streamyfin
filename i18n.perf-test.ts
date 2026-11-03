import { measureFunction } from "reassure";

// Jest does not run Hermes, so the absolute time says nothing about a device.
// Only the trend between two runs of this scenario means anything.
//
// `test-utils/perfSetup.ts` already loads `@/i18n`, but into the module
// registry of the spec. `jest.isolateModules` evaluates `i18n.ts` and its
// dependencies in a fresh one, so each call pays for the load again.
const LOADS = 20;

test("evaluating i18n.ts loads only the active catalogue and en", async () => {
  await measureFunction(
    () => {
      for (let load = 0; load < LOADS; load++) {
        jest.isolateModules(() => {
          require("@/i18n");
        });
      }
    },
    { runs: 10, warmupRuns: 1 },
  );
});
