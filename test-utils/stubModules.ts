/** `@/components/BitrateSelector` with one "Max" entry, for specs that never open the selector. */
export const bitrateSelectorModule = {
  BITRATES: [{ key: "Max", value: undefined }],
};

/** `@/hooks/useAppRouter` with a router whose `push` records nothing. */
export const appRouterModule = {
  __esModule: true,
  default: () => ({ push: jest.fn() }),
};

/** `@/providers/InactivityProvider` without the idle timer. */
export const inactivityModule = {
  useInactivity: () => ({ resetInactivityTimer: () => {} }),
};

/** `expo` without the native MPV module that `codecSupport` probes. */
export const expoWithoutNativeModule = {
  requireOptionalNativeModule: () => null,
};

/** `@/providers/OfflineModeProvider` reporting online. */
export const onlineModule = { useOfflineMode: () => false };

/** `@/constants/TVTypography` with no sizes, for specs that render no TV text. */
export const emptyTVTypographyModule = { useScaledTVTypography: () => ({}) };

/** `@expo/vector-icons` drawing nothing. */
export const blankIconsModule = { Ionicons: () => null };
