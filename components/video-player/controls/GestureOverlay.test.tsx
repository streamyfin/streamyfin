import { act, fireEvent, render } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import { defaultValues, settingsAtom } from "@/utils/atoms/settings";
import { GestureOverlay } from "./GestureOverlay";

// The hold's start and end run on the next animation frame, and its feedback
// fades out on a timer: fake timers run both, and none is left behind.
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const flush = () =>
  act(async () => {
    jest.runOnlyPendingTimers();
  });

const renderOverlay = async () => {
  const store = createStore();
  store.set(settingsAtom, { ...defaultValues, enableHoldToSpeed: true });
  const onHoldSpeedStart = jest.fn();
  const onHoldSpeedEnd = jest.fn();
  const view = await render(
    <JotaiProvider store={store}>
      <GestureOverlay
        showControls
        onToggleControls={() => undefined}
        onSkipForward={() => undefined}
        onSkipBackward={() => undefined}
        onHoldSpeedStart={onHoldSpeedStart}
        onHoldSpeedEnd={onHoldSpeedEnd}
        isPlaying
      />
    </JotaiProvider>,
  );
  const startHold = async () => {
    // With the controls shown, the hold is the overlay's own long press.
    await fireEvent(view.getByTestId("player-gesture-overlay"), "longPress");
    await flush();
    expect(onHoldSpeedStart).toHaveBeenCalledTimes(1);
  };
  const changeSettings = (change: Partial<typeof defaultValues>) =>
    act(async () => {
      store.set(settingsAtom, { ...store.get(settingsAtom), ...change });
    });
  return { view, startHold, changeSettings, onHoldSpeedEnd };
};

describe("the player's hold to speed", () => {
  // Turned off mid-hold (a plugin refresh locking the master switch), the
  // release no longer reached the hold's end: playback stayed at the hold
  // speed and every later hold returned early.
  test.each([
    ["the master switch", { enablePlayerGestures: false }],
    ["its own switch", { enableHoldToSpeed: false }],
  ])("ends a hold when %s turns off", async (_name, change) => {
    const { view, startHold, changeSettings, onHoldSpeedEnd } =
      await renderOverlay();
    await startHold();

    await changeSettings(change);
    await flush();

    expect(onHoldSpeedEnd).toHaveBeenCalledTimes(1);
    await view.unmount();
    await flush();
  });

  test("leaves a hold running while the setting stays on", async () => {
    const { view, startHold, changeSettings, onHoldSpeedEnd } =
      await renderOverlay();
    await startHold();

    await changeSettings({ holdToSpeedRate: 3 });
    await flush();

    expect(onHoldSpeedEnd).not.toHaveBeenCalled();
    await view.unmount();
    await flush();
  });
});
