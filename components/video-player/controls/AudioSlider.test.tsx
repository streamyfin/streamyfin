import { act, render, screen } from "@testing-library/react-native";

let mockResolveRead: (volume: number) => void = () => {};
let mockListener: (event: { volume: number }) => void = () => {};
jest.mock("@/modules/system-volume", () => ({
  addSystemVolumeListener: (listener: (event: { volume: number }) => void) => {
    mockListener = listener;
    return { remove: jest.fn() };
  },
  getSystemVolumeAsync: () =>
    new Promise<number>((resolve) => {
      mockResolveRead = resolve;
    }),
  hideSystemVolumeIndicator: () => () => {},
  setSystemVolume: jest.fn(),
}));
jest.mock(
  "react-native-awesome-slider",
  () => jest.requireActual("@/test-utils/playerControlsNative").sliderModule,
);
jest.mock(
  "react-native-reanimated",
  () => jest.requireActual("@/test-utils/reanimated").reanimatedModule,
);

// Required here rather than imported: an import runs before the mocks above
// exist.
const AudioSlider = require("./AudioSlider")
  .default as typeof import("./AudioSlider").default;

const shownVolume = () =>
  (screen.getByTestId("slider").props.progress as { value: number }).value;

describe("AudioSlider", () => {
  test("shows the system volume once the read lands", async () => {
    await render(<AudioSlider setVisibility={jest.fn()} />);

    await act(async () => mockResolveRead(0.4));

    expect(shownVolume()).toBe(40);
  });

  // The read can take seconds on iOS: a volume key pressed meanwhile is newer.
  test("keeps a change the system reported before the read landed", async () => {
    await render(<AudioSlider setVisibility={jest.fn()} />);

    act(() => mockListener({ volume: 0.7 }));
    await act(async () => mockResolveRead(0.4));

    expect(shownVolume()).toBe(70);
  });
});
