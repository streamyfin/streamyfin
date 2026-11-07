// Wired for every unit spec in `unitSetup.ts`: `bitrateSelectorModule`,
// `appRouterModule`, `inactivityModule`, `deviceModule`, `wifiSsidModule` and
// `jellyfinProbeModule`. The rest are opt-in: a spec mocks them itself.

/** `@/components/BitrateSelector` with one "Max" entry, for specs that never open the selector. */
export const bitrateSelectorModule = {
  BITRATES: [{ key: "Max", value: undefined }],
};

/**
 * `@/hooks/useAppRouter` with one router for the whole spec, so a spec can
 * assert `appRouter.push` without declaring its own mock.
 */
export const appRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
};
export const appRouterModule = {
  __esModule: true,
  default: () => appRouter,
};

/** `@/utils/device` with a fixed device id. */
export const deviceModule = { getOrSetDeviceId: () => "device-1" };

/** `@/modules/wifi-ssid` with a no-op `openLocationSettings`. */
export const wifiSsidModule = { openLocationSettings: () => {} };

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

/**
 * `@/utils/serverUrl/probes/jellyfin` with a `jellyfinProbe` that finds the
 * server and records its calls. A spec drives it with
 * `jest.mocked(jellyfinProbe).mockResolvedValue(...)`.
 */
export const jellyfinProbeModule = () => ({
  ...jest.requireActual("@/utils/serverUrl/probes/jellyfin"),
  jellyfinProbe: jest.fn(async () => ({ status: "ok" })),
});
