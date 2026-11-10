import { atom } from "jotai";

/**
 * `@/utils/atoms/settings` holding the default settings plus `overrides`.
 * Writes are dropped.
 */
export const makeSettingsModule = (overrides: Record<string, unknown> = {}) => {
  // The spec mocks this module, so the real one has to be asked for by name.
  const { defaultValues, TVTypographyScale } = jest.requireActual(
    "@/utils/atoms/settings",
  );
  const settings = { ...defaultValues, ...overrides };
  return {
    // Read at import by constants/TVTypography, which any screen with a TV
    // branch reaches.
    TVTypographyScale,
    settingsAtom: atom(settings),
    effectiveSettingsAtom: atom(settings),
    useSettings: () => ({
      settings,
      updateSettings: () => {},
      pluginSettings: undefined,
    }),
  };
};
