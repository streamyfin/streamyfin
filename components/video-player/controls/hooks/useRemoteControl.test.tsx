import { renderHook } from "@testing-library/react-native";
import { Alert } from "react-native";
import { useRemoteControl } from "./useRemoteControl";

let mockConfirmBeforeStopping = true;
let mockBackHandler: (() => boolean) | undefined;

jest.mock(
  "react-native-reanimated",
  () => jest.requireActual("@/test-utils/reanimated").reanimatedModule,
);
jest.mock("@/i18n", () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({
    settings: { confirmBeforeStoppingPlayback: mockConfirmBeforeStopping },
  }),
}));
jest.mock("@/hooks/useTVBackPress", () => ({
  useTVBackPress: (handler: () => boolean) => {
    mockBackHandler = handler;
  },
}));
jest.mock("@/hooks/useTVEventHandler", () => ({
  useTVEventHandler: () => undefined,
}));

const pressBack = async (props: { showControls?: boolean } = {}) => {
  const onBack = jest.fn();
  const onWillExit = jest.fn();
  const onHideControls = jest.fn();
  await renderHook(() =>
    useRemoteControl({
      showControls: props.showControls ?? false,
      toggleControls: jest.fn(),
      onBack,
      onWillExit,
      onHideControls,
      videoTitle: "Movie",
    }),
  );
  const handled = mockBackHandler?.();
  return { handled, onBack, onWillExit, onHideControls };
};

afterEach(() => jest.restoreAllMocks());

beforeEach(() => {
  mockConfirmBeforeStopping = true;
  mockBackHandler = undefined;
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

describe("pressing back with the controls hidden", () => {
  test("asks before stopping playback by default", async () => {
    const { handled, onBack } = await pressBack();

    expect(handled).toBe(true);
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();
  });

  test("stops playback straight away when the confirmation is turned off", async () => {
    mockConfirmBeforeStopping = false;

    const { handled, onBack, onWillExit } = await pressBack();

    expect(handled).toBe(true);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(onBack).toHaveBeenCalledTimes(1);
    // The countdown must still be held back while the player closes.
    expect(onWillExit).toHaveBeenCalledTimes(1);
  });
});

describe("pressing back with the controls visible", () => {
  test("only hides them, whatever the setting", async () => {
    mockConfirmBeforeStopping = false;

    const { onBack, onHideControls } = await pressBack({ showControls: true });

    expect(onHideControls).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
