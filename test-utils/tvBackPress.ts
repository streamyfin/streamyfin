/**
 * `@/hooks/useTVBackPress` for every unit spec, wired in `unitSetup.ts`. The
 * real hook subscribes to the TV remote's back and menu keys. `useTVBackPress`
 * records each handler it is given, and `pressTVBack()` fires the latest one.
 */
export const tvBackPressModule = {
  useTVBackPress: jest.fn(),
  useTVMenuKeyInterception: jest.fn(),
  enableTVMenuKeyInterception: jest.fn(),
  disableTVMenuKeyInterception: jest.fn(),
};

/** Press back on the TV remote: run the latest handler and return its result. */
export const pressTVBack = () => {
  const { useTVBackPress } = jest.requireMock("@/hooks/useTVBackPress");
  const handler = jest.mocked(useTVBackPress).mock.calls.at(-1)?.[0] as
    | (() => boolean | null | undefined)
    | undefined;
  return handler?.();
};
