import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { swiftUiHostProps } from "@/test-utils/swiftUi";
import { PlatformDropdown } from "./PlatformDropdown";

jest.mock("@/providers/GlobalModalProvider", () => ({
  useGlobalModal: () => ({
    showModal: jest.fn(),
    hideModal: jest.fn(),
    isVisible: false,
  }),
}));

const onPickSecond = jest.fn();
const groups = [
  {
    options: [
      {
        type: "radio" as const,
        label: "First",
        value: 1,
        selected: true,
        onPress: jest.fn(),
      },
      {
        type: "radio" as const,
        label: "Second",
        value: 2,
        selected: false,
        onPress: onPickSecond,
      },
    ],
  },
];

describe("PlatformDropdown on iOS", () => {
  beforeEach(() => jest.clearAllMocks());

  // The Quick Connect user picker sits above a code field that holds the
  // keyboard up. SwiftUI kept the Menu clear of that keyboard, which in a Host
  // the size of its trigger left nothing to tap: the picker drew and never
  // opened. Nothing in JS shows it, so the prop is what there is to pin.
  test("keeps the menu tappable while a keyboard is up", async () => {
    await render(
      <PlatformDropdown groups={groups} trigger={<Text>Pick</Text>} />,
    );

    expect(swiftUiHostProps).toHaveBeenCalledWith(
      expect.objectContaining({ ignoreSafeArea: "keyboard" }),
    );
  });

  test("offers every option and reports the one picked", async () => {
    const onOptionSelect = jest.fn();
    await render(
      <PlatformDropdown
        groups={groups}
        trigger={<Text>Pick</Text>}
        onOptionSelect={onOptionSelect}
      />,
    );

    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    await fireEvent.press(screen.getByText("Second"));

    expect(onPickSecond).toHaveBeenCalledTimes(1);
    expect(onOptionSelect).toHaveBeenCalledWith(2);
  });
});
