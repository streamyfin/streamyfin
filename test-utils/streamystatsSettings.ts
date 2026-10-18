import { atom } from "jotai";

/**
 * `@/utils/atoms/settings` with a Streamystats server configured, for a
 * scenario that renders what only shows when one is. Writes are dropped.
 */
export const streamystatsSettingsModule = (() => {
  // The spec mocks this module, so the real one has to be asked for by name.
  const { defaultValues } = jest.requireActual("@/utils/atoms/settings");
  const settings = {
    ...defaultValues,
    streamyStatsServerUrl: "http://streamystats.test",
  };
  return {
    effectiveSettingsAtom: atom(settings),
    useSettings: () => ({
      settings,
      updateSettings: () => {},
      pluginSettings: undefined,
    }),
  };
})();
